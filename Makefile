.PHONY: build dist deploy clean

# ============================================================
# build — run Vite production build
# ============================================================
build:
	npm run build

# ============================================================
# dist — alias for build
# ============================================================
dist: build

# ============================================================
# deploy — upload dist/ to GCS (requires GCS= argument)
# ============================================================
# Usage: make deploy GCS=gs://bucket/path
# Compares local MD5 with remote before uploading (incremental).

GCS ?=

deploy: dist
ifndef GCS
	$(error Usage: make deploy GCS=gs://bucket/path)
endif
	@echo "==> Uploading to $(GCS) (incremental) ..."
	@upload_if_changed() { \
	  local src="$$1"; shift; \
	  local dst="$$1"; shift; \
	  local local_md5; \
	  local_md5="$$(md5 -q "$$src" 2>/dev/null || md5sum "$$src" | cut -d' ' -f1)"; \
	  local remote_md5; \
	  remote_md5="$$(gcloud storage objects describe "$$dst" --format='value(md5_hash)' 2>/dev/null || true)"; \
	  local local_md5_b64; \
	  local_md5_b64="$$(printf '%s' "$$local_md5" | xxd -r -p | base64)"; \
	  if [ "$$local_md5_b64" = "$$remote_md5" ]; then \
	    echo "  skip (unchanged): $$src"; \
	    return 0; \
	  fi; \
	  echo "  upload: $$src"; \
	  gcloud storage cp "$$src" "$$dst" "$$@"; \
	}; \
	for f in $$(find dist -type f ! -name 'index.html'); do \
	  rel="$${f#dist/}"; \
	  case "$$f" in \
	    *.wasm) ct="--content-type=application/wasm" ;; \
	    *.js)   ct="--content-type=application/javascript" ;; \
	    *.css)  ct="--content-type=text/css" ;; \
	    *.png)  ct="--content-type=image/png" ;; \
	    *)      ct="" ;; \
	  esac; \
	  upload_if_changed "$$f" "$(GCS)/$$rel" --cache-control="public,max-age=31536000" $$ct; \
	done; \
	echo "  upload: index.html (always)"; \
	gcloud storage cp dist/index.html "$(GCS)/index.html" --cache-control="no-cache" --content-type="text/html; charset=utf-8"
	@echo ""
	@echo "==> Done: $(GCS)/"

# ============================================================
# clean — remove build artifacts
# ============================================================
clean:
	rm -rf dist
