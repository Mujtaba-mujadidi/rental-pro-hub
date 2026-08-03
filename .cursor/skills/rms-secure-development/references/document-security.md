# Document security (Rental Pro Hub)

Protected documents include: identity documents, driving licences, proof of address, signatures, signed contracts, company legal documents, invoice attachments, and payment evidence.

## Defaults

- **Private by default** — `public = false` storage buckets.
- **Never** store protected documents with permanent public URLs.
- Authorise **every** upload, preview, download, replacement, email attachment, and deletion on the server.
- Generate **short-lived signed URLs** only after authorisation succeeds.
- Clients must not choose another tenant’s or driver’s storage path.
- Use **server-generated random** object names (or opaque IDs); never trust client path segments.
- Sanitise display filenames; reject path traversal and double extensions.

## Current private buckets (inspect migrations before changing)

| Bucket | Typical path / gate |
| --- | --- |
| `driver-licences` | `{driver_user_id}/…` — owner RLS; company access via authorised server + service role |
| `vehicle-documents` | `{parent_company_id}/{vehicle_id}/…` |
| `hire-inspection-media` | company folder; hire driver may read completed media per policy |
| `esign-documents` | service-mediated |
| `company-logos` / `subcompany-logos` | private; signed or admin-mediated |

Confirm policies in `supabase/migrations` when adding buckets or changing access.

## Metadata to store (where applicable)

Link each object to: driver, parent company, subcompany, relationship (hire / access request), document type, owner, status.

## Upload validation

- Extension allow-list.
- Declared MIME type allow-list.
- Actual file signature / magic bytes where practical.
- File-size limits.
- Reject active content that would execute in the app origin; prefer download disposition for risky types.

## Download / preview

- After authz: short-lived signed URL (typical TTLs in app today ~3600s — prefer shorter for identity docs when changing code).
- Safe `Content-Disposition` (attachment for sensitive types).
- `X-Content-Type-Options: nosniff`.
- Private / no-store caching for sensitive documents.
- **Never log** signed URLs or document contents.
- **Audit** sensitive previews and downloads.

## Driver approval

- Company staff may access a driver’s **identity documents** only when:
  1. Driver–company access is **active/approved**; and  
  2. The staff user has the **internal capability** for that module (not merely “any staff”).
- Pending / rejected / revoked / expired → deny.

## Isolation

- Prevent Company A from replacing/deleting Company B’s documents.
- Prevent Driver A from accessing Driver B’s documents.
- After relationship termination: retained objects remain protected; access only under retention / legal rules — not “still linked in UI” alone.

## Malware / quarantine

- Prefer upload to private storage, validate type/size, then process.
- If a quarantine pipeline is not yet implemented, document residual risk; do not claim scanning exists.
- Block executable and unexpected content types at the allow-list.

## Email attachments

- Authorise the same as download.
- Do not attach files to messages based on client-supplied paths.
- Prefer links that re-check authz over embedding binaries when possible.

## Retention

- Honour product retention fields (e.g. hire driver-document retain-until) and company/legal holds.
- Deletion must be authorised, audited, and tenant-scoped.
