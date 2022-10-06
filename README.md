# Satisfactory On Demand

A tool that act as a proxy for Satisfactory dedicated server traffic and make the server only exist when players are logged in.

## How it works

The server needs to sit somewhere that will always be available. But this server can be a smaller box and cheaper. It will look in your cloud provider for a server with a particular name and boot it up and start forwarding all the traffic to it. This server can be a larger more expensive one to handle the needs of the Satisfactory server. When it sees that all the traffic has died down, it will wait for a bit and shut down the server.
This means the server will appear unavailable for a little while the server boots itself up, but it will also cost a lot less.
While the compute cost of the server is lower, keep in mind that you will still be paying for the storage of the computer. As either a snapshot or drive image. However in AWS, this cost is less than $2 a month.

### Supported cloud providers

- AWS
- Vultr (buggy though)

## How to set it up

It helps if you are familiar with terraform and docker.
You need to have a running server in your cloud provider already running before the on demand proxy will work. If you are using AWS, there is a terraform project in the repo that will set up a server that will keep itself updated, backed up, and it will be a spot instance to keep the price down.

In that directory create a `terraform.tfvars` file with the following content:

```terraform.tfvars
key_pair = "key-file-name" # name of an existing key pair in your aws account
aws_region = "region" # aws's name for the region you want to use. optional. defaults to sydney
time_zone = "Country/City" # name of your time zone per the TZ database. optional. defaults to UTC
instance_name = "server" # name to give the satisfactory server. optional. defaults to "satisfactory"
```

then run

```bash
# terraform apply
```

It should create the server and the an s3 bucket and several policies and accounts. It will output an AWS access key and secret that you should remember for later. Be sure to keep your `*.tfstate` to your self as it contains your secret.

Now go to your server that is going to act as your always on proxy and run the docker instance. Here is an example `docker-compose.yml`:

```docker-compose.yml
version: "3.9"
services:
  on-demand:
    image: "ghcr.io/echelonfour/satisfactory-on-demand:latest"
    ports:
      - "15777:15777/udp"
      - "15000:15000/udp"
      - "7777:7777/udp"
    environment:
      AWS_REGION: REPLACE_ME # name of your aws region
      AWS_ACCESS_KEY_ID: REPLACE_ME # your key from terraform
      AWS_SECRET_ACCESS_KEY: REPLACE_ME # your secret from terraform
      # CLOUD_SERVER_NAME: REPLACE_ME # optional. server name if custom one used in set up
    restart: unless-stopped
```

Then run:

```bash
# docker-compose up -d
```

You can then connect to the server via the always on proxy as normal.

## Config options

Use these environment variables to reconfigure the app in the docker container

| Environment           | Description                                                                       | Format                            | Default      |
| --------------------- | --------------------------------------------------------------------------------- | --------------------------------- | ------------ |
| AWS_REGION            | AWS region code.                                                                  | string                            |              |
| AWS_ACCESS_KEY_ID     | AWS access key to use to command the server to turn on and off.                   | string                            |              |
| AWS_SECRET_ACCESS_KEY | AWS secret to use to command the server to turn on and off.                       | string                            |              |
| CLOUD_MANAGER         | Name of cloud provider                                                            | aws,vultr                         | aws          |
| CLOUD_SERVER_NAME     | Name of server in cloud provider to control                                       | string                            | satisfactory |
| CLOUD_SNAPSHOT_NAME   | Name to give snapshot before destroying server in cloud provider                  | string                            | satisfactory |
| FAKE_VERSION          | Number to supply back to satisfactory when the server is offline                  | number                            | 69420        |
| LOG_LEVEL             | Level of logs to print to stdout.                                                 | fatal,error,warn,info,debug,trace | debug        |
| ENVOY_TEMPLATE        | Path to an envoy template file if you want to customise that for whatever reason. | string                            | ./envoy.yaml |
| ENVOY_ADMIN_PORT      | Port to use for talking to envoy internally                                       | port                              | 19000        |
| STATS_READ_INTERVAL   | Milliseconds between checking how many sessions are currently logged in.          | number                            | 1000         |
| SHUTDOWN_DELAY        | Seconds to wait before shutting down cloud server                                 | number                            | 10 minutes   |
| FAKE_QUERY_PORT       | Port to host fake query version on internally                                     | port                              | 15666        |
| QUERY_PORT            | Port to listen and forward to satisfactory                                        | port                              | 15777        |
| BEACON_PORT           | Port to listen and forward to satisfactory                                        | port                              | 15000        |
| GAME_PORT             | Port to listen and forward to satisfactory                                        | port                              | 7777         |

## How to view logs

The logs are fancy json logs for no reason. To view them run a command like:

```bash
# docker logs satisfactory_on-demand_1 -f | docker run --rm -i ghcr.io/echelonfour/satisfactory-on-demand/pino-pretty:latest
```

## Contributing

PRs are welcome.
There is room for expansion in the cloud providers. I was going to look into GCP because their instances have a hibernate mode that could make for very fast system boot times.
I think there is also an advantage in moving much of the instance upstart stuff out of terraform and in to the server itself. That would help those without terraform knowledge run the server easier. And it would allow one of the server states to be "cold", where if no one logs into the server in weeks it deletes it entirely and uses the bucket backups if someone comes back.

## License

MIT License

Copyright (c) 2021 Frank Fenton
