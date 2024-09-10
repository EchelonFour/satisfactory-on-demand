resource "aws_security_group" "satisfactory" {
  name        = "allow-satisfactory-traffic"
  description = "Allows Satisfactory traffic in"
}

resource "aws_security_group_rule" "satisfactory_game" {
  security_group_id = aws_security_group.satisfactory.id
  type              = "ingress"
  from_port         = 7777
  to_port           = 7777
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  ipv6_cidr_blocks  = ["::/0"]
  description       = "game"
}

resource "aws_security_group_rule" "satisfactory_server" {
  security_group_id = aws_security_group.satisfactory.id
  type              = "ingress"
  from_port         = 7777
  to_port           = 7777
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  ipv6_cidr_blocks  = ["::/0"]
  description       = "server"
}

resource "aws_security_group_rule" "all_udp_out" {
  security_group_id = aws_security_group.satisfactory.id
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  ipv6_cidr_blocks  = ["::/0"]
  description       = "for satisfactory return traffic"
}

resource "aws_security_group" "manage" {
  name        = "allow-management-traffic"
  description = "Allows traffic to manage server"
}

data "http" "my_public_ip" {
  url = "https://ifconfig.co/json"
  request_headers = {
    Accept = "application/json"
  }
}

locals {
  my_ip_address = jsondecode(data.http.my_public_ip.response_body).ip
}

data "aws_ip_ranges" "ec2_connect_ip_ranges" {
  regions  = [var.aws_region]
  services = ["ec2_instance_connect"]
}

resource "aws_security_group_rule" "ssh_in" {
  security_group_id = aws_security_group.manage.id
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = concat(["${local.my_ip_address}/32"], data.aws_ip_ranges.ec2_connect_ip_ranges.cidr_blocks)
  ipv6_cidr_blocks  = data.aws_ip_ranges.ec2_connect_ip_ranges.ipv6_cidr_blocks
  description       = "ssh from you"
}

resource "aws_security_group_rule" "icmp_in" {
  security_group_id = aws_security_group.manage.id
  type              = "ingress"
  from_port         = -1
  to_port           = -1
  protocol          = "icmp"
  cidr_blocks       = ["0.0.0.0/0"]
  ipv6_cidr_blocks  = ["::/0"]
  description       = "pings and whatnot"
}

resource "aws_security_group_rule" "all_outbound_allowed" {
  security_group_id = aws_security_group.manage.id
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  ipv6_cidr_blocks  = ["::/0"]
  description       = "all traffic allowed"
}
