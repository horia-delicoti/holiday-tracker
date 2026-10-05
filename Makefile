# =============================================================
#  Holiday Tracker — shortcuts
#
#  Thin wrappers. The npm scripts in package.json stay the source of truth
#  (the pre-commit hook and CI call them directly); this file only saves
#  typing and adds the Docker and release steps that were copy-paste.
#
#      make            # list targets
#      make verify     # what the pre-commit hook runs
# =============================================================

SHELL        := /bin/sh
.DEFAULT_GOAL := help

APP_DIR      := app.web
IMAGE        := holiday-tracker
PORT         ?= 8100
SMOKE_PORT   ?= 8198
# The version stamped into a local image: the nearest tag plus a suffix when
# HEAD is past it or dirty — the honest answer, never a hand-edited file.
APP_VERSION  ?= $(shell git describe --tags --dirty --always 2>/dev/null || echo dev)

.PHONY: help setup install hooks verify check syntax lint fix selfcheck test \
        run demo image image-run image-smoke release clean-tmp

help: ## Show this list
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make \033[36m<target>\033[0m\n"} \
	  /^##@ / { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
	  /^[a-z][a-z-]*:.*## / { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##@ Setup
setup: install hooks ## First run in a fresh clone: install + hooks

install: ## Install dev tooling (nothing here reaches the image)
	npm install

hooks: ## Point git at .githooks/ (pre-commit gate)
	npm run --silent hooks

##@ Run locally
run: ## Run locally against your REAL ledger in app.web/data/
	cd $(APP_DIR) && PORT=$(PORT) node server.js

demo: ## Run locally on a throwaway data dir (safe for screenshots)
	@d=$$(mktemp -d -t holiday-tracker-demo-XXXXXX); \
	echo "demo data: $$d  (deleted on exit)"; \
	trap 'rm -rf "$$d"' EXIT INT TERM; \
	cd $(APP_DIR) && PORT=$(PORT) DATA_DIR="$$d" node server.js

##@ Checks
verify: ## syntax + lint + selfcheck + tests (run before every commit)
	npm run --silent verify

check: verify ## Alias for verify

syntax: ## node --check on server and selfcheck
	npm run --silent syntax

lint: ## ESLint, including inline <script> in index.html
	npm run --silent lint

fix: ## ESLint with --fix
	npm run --silent lint:fix

selfcheck: ## Invariant checks — guard against a wrong number
	npm run --silent selfcheck

test: ## Boot the server on a temp data dir and drive the API
	npm test

##@ Docker
image: ## Build the image locally, stamped with git describe
	docker build --build-arg APP_VERSION=$(APP_VERSION) -t $(IMAGE):dev $(APP_DIR)

image-run: image ## Build and run the image on a throwaway volume (Ctrl+C stops)
	docker run --rm -it -p 127.0.0.1:$(PORT):8100 -e TZ=Europe/London $(IMAGE):dev

image-smoke: image ## Build, boot and probe the image — same check as CI
	@set -e; name=ht-smoke-$$$$; \
	docker run -d --name $$name -p 127.0.0.1:$(SMOKE_PORT):8100 $(IMAGE):dev >/dev/null; \
	trap 'docker rm -f '$$name' >/dev/null 2>&1' EXIT; \
	for i in $$(seq 1 30); do \
	  if curl -fsS http://127.0.0.1:$(SMOKE_PORT)/api/data >/dev/null 2>&1; then \
	    curl -fsS http://127.0.0.1:$(SMOKE_PORT)/ | grep -qi '<html' \
	      || { echo "✗ /api/data answered but the app shell did not"; exit 1; }; \
	    echo "✓ container answered after $${i}s and served the app shell"; exit 0; \
	  fi; sleep 1; \
	done; \
	echo "✗ container never answered on /api/data"; docker logs $$name; exit 1

##@ Release
release: ## Tag and push a release: make release V=1.5.2  (CI publishes the image)
	@[ -n "$(V)" ] || { echo "usage: make release V=X.Y.Z"; exit 1; }
	@echo "$(V)" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$' \
	  || { echo "V must be X.Y.Z (no leading v), got '$(V)'"; exit 1; }
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "not on main"; exit 1; }
	@git diff --quiet && git diff --cached --quiet || { echo "working tree is dirty"; exit 1; }
	@! git rev-parse -q --verify "refs/tags/v$(V)" >/dev/null || { echo "tag v$(V) already exists"; exit 1; }
	@git fetch -q origin main
	@[ "$$(git rev-parse HEAD)" = "$$(git rev-parse origin/main)" ] \
	  || { echo "main is not in sync with origin/main — push or pull first"; exit 1; }
	@$(MAKE) --no-print-directory verify
	@echo "latest tag: $$(git describe --tags --abbrev=0 2>/dev/null || echo none)"
	@printf "Tag and push v$(V)? This publishes an image to GHCR. [y/N] "; read a; [ "$$a" = y ]
	git tag -a v$(V) -m "v$(V)"
	git push origin v$(V)
	@echo "→ CI is building ghcr.io/horia-delicoti/holiday-tracker:$(V)"
	@echo "→ then bump the version pin in the infra repo and run the playbook"

##@ Housekeeping
clean-tmp: ## Delete stray *.tmp files (git-ignored scratch)
	find . -name '*.tmp' -not -path './node_modules/*' -print -delete
