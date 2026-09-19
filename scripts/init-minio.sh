#!/bin/sh

set -e

echo "🚀 Starting MinIO initialization..."

# Wait for MinIO to be ready
echo "⏳ Waiting for MinIO to be ready..."
until mc alias set myminio http://minio:9000 ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} 2>/dev/null; do
  echo "   Retrying in 2 seconds..."
  sleep 2
done

echo "✅ MinIO is ready"

# "discus" holds the coaching pipeline's audio, video and image uploads.
# "invoices" holds invoice documents, laid out as invoices/<userId>/<uuid>.<ext>
# so the webhook can derive the owning user from the object path.
for BUCKET_NAME in discus invoices; do
  if mc ls myminio/${BUCKET_NAME} >/dev/null 2>&1; then
    echo "✅ Bucket '${BUCKET_NAME}' already exists"
  else
    mc mb myminio/${BUCKET_NAME}
    echo "✅ Created bucket '${BUCKET_NAME}'"
  fi

  # Both buckets notify the same endpoint; the handler routes on the object
  # path and content type. Without this on "invoices", an uploaded invoice
  # would sit in storage and never be extracted.
  mc event add myminio/${BUCKET_NAME} arn:minio:sqs::primary:webhook \
    --event put,delete,get 2>/dev/null \
    && echo "✅ Configured webhook notification for '${BUCKET_NAME}'" \
    || echo "✅ Webhook notification already configured for '${BUCKET_NAME}'"
done

echo "   Webhook endpoint: http://api:8000/storage/webhook"
echo "🎉 MinIO initialization completed successfully!"
