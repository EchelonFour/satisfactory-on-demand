resource "aws_s3_bucket" "backups" {
  bucket_prefix = "satisfactory-saves"
}

resource "aws_s3_bucket_acl" "backups" {
  bucket = aws_s3_bucket.backups.id
  acl    = "private"
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  # Must have bucket versioning enabled first
  depends_on = [aws_s3_bucket_versioning.backups]

  bucket = aws_s3_bucket.backups.bucket

  rule {
    id = "decay_old"

    noncurrent_version_expiration {
      noncurrent_days = 120
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    status = "Enabled"
  }
}

data "aws_iam_policy_document" "access_backup" {
  statement {
    sid     = "ListObjectsInBucket"
    actions = ["s3:ListBucket"]

    resources = [
      "arn:aws:s3:::${aws_s3_bucket.backups.id}",
    ]
  }

  statement {
    sid     = "AllObjectActions"
    actions = ["s3:*Object"]

    resources = ["arn:aws:s3:::${aws_s3_bucket.backups.id}/*"]
  }
}

resource "aws_iam_policy" "access_backup" {
  name = "satisfactory_access_backups"
  path = "/"

  policy = data.aws_iam_policy_document.access_backup.json
}
