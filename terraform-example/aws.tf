terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.8.0"
    }
  }
}

# Configure the AWS Provider
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Terraform = "Satisfactory"
    }
  }
}

data "aws_caller_identity" "current" {}
