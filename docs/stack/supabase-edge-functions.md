# Supabase Edge Functions

> Source: https://github.com/supabase/supabase/tree/master/examples/edge-functions

## Overview

Edge Functions are server-side TypeScript functions that run on Deno, deployed globally on Supabase's edge network.

## Local Development

```bash
# Start Supabase locally (Docker required)
supabase start

# Create env file
cp ./supabase/.env.local.example ./supabase/.env.local

# Serve functions locally
supabase functions serve --env-file ./supabase/.env.local --no-verify-jwt
```

## Deploy

### CLI Deployment

```bash
# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set --env-file ./supabase/.env.local

# Deploy single function
supabase functions deploy your-function-name

# Deploy all functions (v1.62.0+)
supabase functions deploy --project-ref $PROJECT_ID
```

### GitHub Actions

```yaml
name: Deploy Function

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_ID: your-project-id

    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase functions deploy --project-ref $PROJECT_ID
```

## Configuration (config.toml)

```toml
[functions.hello-world]
verify_jwt = false
```

## Invoke from Client

### JavaScript

```javascript
const { data, error } = await supabase.functions.invoke("function-name", {
  body: { key: "value" },
});
```

### Python

```python
response = supabase.functions.invoke("function-name", invoke_options={
    "body": {"key": "value"}
})
```

### cURL

```bash
curl -L -X POST 'https://<project>.supabase.co/functions/v1/function-name' \
  -H 'Authorization: Bearer <anon-key>' \
  -H 'Content-Type: application/json' \
  --data '{"key":"value"}'
```

## Resources

- [Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Examples](https://github.com/supabase/supabase/tree/master/examples/edge-functions)
