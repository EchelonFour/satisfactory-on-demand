data "aws_iam_policy_document" "server_management" {
  statement {
    actions = [
      "ec2:StartInstances",
      "ec2:StopInstances",
    ]

    resources = [
      "arn:aws:ec2:*:${data.aws_caller_identity.current.account_id}:instance/*",
    ]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:ResourceTag/Name"
      values   = [var.instance_name]
    }
  }

  statement {
    actions = [
      "ec2:DescribeInstances",
      "ec2:DescribeSpotInstanceRequests"
    ]

    resources = [
      "*",
    ]
  }
}

resource "aws_iam_policy" "turn_on_off" {
  name = "satisfactory_manager"
  path = "/"

  policy = data.aws_iam_policy_document.server_management.json
}

resource "aws_iam_user" "manager_user" {
  name = "satisfactory"
  path = "/"
}

resource "aws_iam_user_policy_attachment" "manager_can_turn_on_off" {
  policy_arn = aws_iam_policy.turn_on_off.arn
  user       = aws_iam_user.manager_user.name
}
resource "aws_iam_access_key" "key" {
  user = aws_iam_user.manager_user.name
}
