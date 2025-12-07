# Supabase GraphQL (pg_graphql)

Auto-generated GraphQL API from your Postgres schema.

**Docs:** https://supabase.com/docs/guides/graphql

---

## Overview

Supabase automatically generates a GraphQL API using `pg_graphql`:

- Reflects tables, views, and relationships
- CRUD operations with filtering and pagination
- Uses Postgres RLS for security
- Single round-trip resolution

---

## API Endpoint

```
https://<PROJECT_REF>.supabase.co/graphql/v1
```

**Required Headers:**

- `apiKey: <your-anon-key>`
- `Content-Type: application/json`
- `Authorization: Bearer <JWT>` (for authenticated requests)

---

## GraphiQL IDE

Access the built-in GraphQL IDE:
**Supabase Dashboard** → **API Docs** → **GraphQL**

---

## Query Examples

### Fetch All Transactions

```graphql
query {
  transactionsCollection {
    edges {
      node {
        id
        merchant
        amount
        entity
        qbAccount
        date
      }
    }
  }
}
```

### Filter by Entity

```graphql
query {
  transactionsCollection(filter: { entity: { eq: "Origin" } }) {
    edges {
      node {
        id
        merchant
        amount
      }
    }
  }
}
```

### Pagination

```graphql
query {
  transactionsCollection(first: 10, after: "cursor-here") {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        merchant
      }
    }
  }
}
```

### Insert a Merchant Rule

```graphql
mutation {
  insertIntoMerchantRulesCollection(
    objects: [
      {
        merchant: "NEW VENDOR"
        entityDefault: "Origin"
        originQbAccount: "Equipment Expense:Repair & Maintenance"
      }
    ]
  ) {
    records {
      id
      merchant
    }
  }
}
```

### Update Transaction

```graphql
mutation {
  updateTransactionsCollection(
    filter: { id: { eq: "uuid-here" } }
    set: { entity: "Origin", notes: "Reviewed" }
  ) {
    records {
      id
      entity
    }
  }
}
```

---

## Using with JavaScript

```javascript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const { data, error } = await supabase
  .from("graphql")
  .select()
  .single()
  .then(() =>
    fetch(`${SUPABASE_URL}/graphql/v1`, {
      method: "POST",
      headers: {
        apiKey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { transactionsCollection { edges { node { id merchant } } } }`,
      }),
    }),
  );
```

---

## Schema Visibility

Tables in `public` schema are exposed by default. Control access:

```sql
-- Hide a table from GraphQL
REVOKE SELECT ON my_secret_table FROM anon, authenticated;
```

---

_Source: Supabase Docs - pg_graphql extension_
