import os

import boto3
from botocore.config import Config


ACCESS_KEY = os.environ.get("NCP_ACCESS_KEY", "YOUR_ACCESS_KEY")
SECRET_KEY = os.environ.get("NCP_SECRET_KEY", "YOUR_SECRET_KEY")
BUCKET = os.environ.get("NCP_OBJECT_STORAGE_BUCKET", "YOUR_BUCKET_NAME")
ENDPOINT_URL = os.environ.get("NCP_OBJECT_STORAGE_ENDPOINT", "https://kr.object.ncloudstorage.com")
REGION_NAME = os.environ.get("NCP_OBJECT_STORAGE_REGION", "kr-standard")


config = Config(
    signature_version="s3v4",
    s3={
        "addressing_style": "path",
    },
    request_checksum_calculation="when_required",
    response_checksum_validation="when_required",
)

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT_URL,
    region_name=REGION_NAME,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=config,
)

print("1. List Objects")

response = s3.list_objects_v2(Bucket=BUCKET)
for item in response.get("Contents", []):
    print(f"- {item['Key']} ({item['Size']} bytes)")

if "Contents" not in response:
    print("No objects found.")
