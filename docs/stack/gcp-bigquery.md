# Google Cloud BigQuery Python

> Source: https://cloud.google.com/bigquery/docs/samples/bigquery-query-results-dataframe

## Installation

```bash
pip install google-cloud-bigquery pandas db-dtypes
```

## Authentication

Set up Application Default Credentials:

```bash
gcloud auth application-default login
```

Or use a service account:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

## Basic Usage

### Query to DataFrame

```python
from google.cloud import bigquery

client = bigquery.Client()

sql = """
    SELECT name, SUM(number) as count
    FROM `bigquery-public-data.usa_names.usa_1910_current`
    GROUP BY name
    ORDER BY count DESC
    LIMIT 10
"""

df = client.query_and_wait(sql).to_dataframe()
```

### Table to DataFrame

```python
from google.cloud import bigquery

client = bigquery.Client()

table_id = "project.dataset.table"
df = client.list_rows(table_id).to_dataframe()
```

### Load DataFrame to BigQuery

```python
from google.cloud import bigquery
import pandas as pd

client = bigquery.Client()
table_id = "project.dataset.table"

df = pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]})

job = client.load_table_from_dataframe(df, table_id)
job.result()  # Wait for completion
```

## Using pandas-gbq

Alternative library for simpler pandas integration:

```bash
pip install pandas-gbq
```

```python
import pandas as pd

# Read from BigQuery
df = pd.read_gbq("SELECT * FROM `project.dataset.table`", project_id="your-project")

# Write to BigQuery
df.to_gbq("dataset.table", project_id="your-project", if_exists="replace")
```

## Resources

- [BigQuery Python Client](https://cloud.google.com/python/docs/reference/bigquery/latest)
- [pandas-gbq](https://pandas-gbq.readthedocs.io/)
- [BigQuery DataFrames](https://cloud.google.com/bigquery/docs/bigquery-dataframes-introduction)
