# Google Cloud Storage Python

> Source: https://github.com/googleapis/python-storage

## Installation

```bash
pip install google-cloud-storage
```

## Authentication

```bash
gcloud auth application-default login
# or
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

## Basic Usage

### Initialize Client

```python
from google.cloud import storage

client = storage.Client()
bucket = client.bucket("my-bucket")
```

### Upload File

```python
# From file
blob = bucket.blob("path/to/destination.txt")
blob.upload_from_filename("local-file.txt")

# From string
blob = bucket.blob("path/to/file.txt")
blob.upload_from_string("Hello, World!")

# From memory (file object)
from io import BytesIO
blob = bucket.blob("path/to/file.txt")
blob.upload_from_file(BytesIO(b"data"))
```

### Download File

```python
# To file
blob = bucket.blob("path/to/file.txt")
blob.download_to_filename("local-file.txt")

# To string
content = blob.download_as_string()

# To memory
from io import BytesIO
buffer = BytesIO()
blob.download_to_file(buffer)
```

### List Files

```python
# List all blobs in bucket
blobs = client.list_blobs("my-bucket")
for blob in blobs:
    print(blob.name)

# List with prefix (folder)
blobs = client.list_blobs("my-bucket", prefix="folder/")
```

### Delete File

```python
blob = bucket.blob("path/to/file.txt")
blob.delete()
```

### Get Metadata

```python
blob = bucket.blob("path/to/file.txt")
blob.reload()  # Fetch metadata

print(f"Size: {blob.size}")
print(f"Content type: {blob.content_type}")
print(f"Created: {blob.time_created}")
print(f"Updated: {blob.updated}")
```

### Set Metadata

```python
blob = bucket.blob("path/to/file.txt")
blob.metadata = {"key": "value"}
blob.patch()
```

### Signed URLs

Generate time-limited access URLs:

```python
from datetime import timedelta

blob = bucket.blob("path/to/file.txt")
url = blob.generate_signed_url(
    version="v4",
    expiration=timedelta(hours=1),
    method="GET"
)
```

### FileIO with Pandas

```python
import pandas as pd
from google.cloud import storage

client = storage.Client()
bucket = client.bucket("my-bucket")
blob = bucket.blob("data.csv")

# Read CSV directly
with blob.open("r") as f:
    df = pd.read_csv(f)

# Write CSV directly
with blob.open("w") as f:
    df.to_csv(f, index=False)
```

## Environment Variables

```bash
export GOOGLE_CLOUD_PROJECT=your-project-name
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

## Resources

- [Python Storage Samples](https://github.com/googleapis/python-storage/tree/main/samples)
- [API Reference](https://cloud.google.com/python/docs/reference/storage/latest)
