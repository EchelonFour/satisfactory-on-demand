import config from "../config";
import { AwsManager } from "./aws/client";
import { CloudManager } from "./cloud-manager";
import { VultrManager } from "./vultr/client";

export function cloudManagerFromConfig(): CloudManager {
  const cloudManager = config.get('cloudManager')
  const nameOfServer = config.get('nameOfSatisfactoryServer')
  const nameOfSnapshot = config.get('nameOfSatisfactorySnapshot')
  if (cloudManager === 'aws') {
    return new AwsManager(nameOfServer, nameOfSnapshot, config.get('awsConfig'))
  } else if (cloudManager === 'vultr') {
    return new VultrManager(nameOfServer, nameOfSnapshot, 'TODO')
  }
  throw new Error(`could not find a cloud manager for ${cloudManager}`)
}