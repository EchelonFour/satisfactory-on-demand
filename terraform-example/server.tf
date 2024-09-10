data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu-minimal/images/hvm-ssd/ubuntu-jammy-22.04-amd64-minimal-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

resource "aws_spot_instance_request" "server" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3a.large"

  iam_instance_profile = aws_iam_instance_profile.server.name
  user_data = templatefile("${path.module}/cloud-init.yml.tftpl", {
    bucket    = aws_s3_bucket.backups.id,
    time_zone = var.time_zone
  })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  spot_type                      = "persistent"
  instance_interruption_behavior = "stop"

  key_name = var.key_pair

  vpc_security_group_ids = [
    aws_security_group.satisfactory.id,
    aws_security_group.manage.id,
  ]

  tags = {
    Name = var.instance_name
  }
}

resource "time_sleep" "wait_for_spot_be_be_real" {
  depends_on = [aws_spot_instance_request.server]
  lifecycle {
    replace_triggered_by = [
      aws_spot_instance_request.server
    ]
  }
  create_duration = "20s"
}

data "aws_instance" "server" {
  // This is to work around spot instances in terrform not being able to set tags on their instance
  depends_on = [
    time_sleep.wait_for_spot_be_be_real,
  ]

  filter {
    name   = "spot-instance-request-id"
    values = [aws_spot_instance_request.server.id]
  }
}

resource "aws_ec2_tag" "server_name" {
  resource_id = data.aws_instance.server.id
  key         = "Name"
  value       = var.instance_name
}

resource "aws_iam_role" "server" {
  name = "satisfactory_instance"

  assume_role_policy = jsonencode({
    "Version" = "2012-10-17",
    "Statement" = [
      {
        "Sid"    = "",
        "Effect" = "Allow",
        "Action" = "sts:AssumeRole",
        "Principal" = {
          "Service" = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy_attachment" "instance_can_backup" {
  name       = "satisfactory_instance_can_backup"
  roles      = [aws_iam_role.server.name]
  policy_arn = aws_iam_policy.access_backup.arn
}

resource "aws_iam_instance_profile" "server" {
  name = "satisfactory_instance_profile"
  role = aws_iam_role.server.name
}
