# DocuSeal removed

Local DocuSeal Docker is **no longer part of RMS**. Contract e-sign is native — see [docs/esign.md](../../docs/esign.md).

You can delete leftover Docker volumes/containers if any:

```bash
docker rm -f docuseal-docuseal-1 docuseal-postgres-1 2>/dev/null
docker volume rm docuseal_docuseal_pg_data docuseal_docuseal_app_data 2>/dev/null
```
