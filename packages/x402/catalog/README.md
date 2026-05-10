# x402 service catalog

Static JSON catalog generated from https://github.com/solana-foundation/pay-skills.

- `index.json` lists every service and points to provider detail files.
- `providers/*.json` preserves PAY.md metadata, markdown documentation, endpoint URLs, request/response schemas, x402 metadata, and the resolved OpenAPI spec when available.

Regenerate with:

```bash
PAY_SKILLS_COMMIT=$(git -C /path/to/pay-skills rev-parse HEAD) node packages/x402/scripts/build-pay-skills-catalog.mjs /path/to/pay-skills
```
