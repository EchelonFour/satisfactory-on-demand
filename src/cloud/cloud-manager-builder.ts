import config from "../config.js";
import { AwsManager } from "./aws/client.js";
import { CloudManager } from "./cloud-manager.js";
import { VultrManager } from "./vultr/client.js";

export function cloudManagerFromConfig(): CloudManager {
  const cloudManager = config.get('cloudManager')
  const nameOfServer = config.get('nameOfSatisfactoryServer')
  const nameOfSnapshot = config.get('nameOfSatisfactorySnapshot')
  if (cloudManager === 'aws') {
    return new AwsManager(nameOfServer, nameOfSnapshot, config.get('awsConfig'))
  } else if (cloudManager === 'vultr') {
    return new VultrManager(nameOfServer, nameOfSnapshot, config.get('vultrConfig'))
  }
  throw new Error(`could not find a cloud manager for ${cloudManager}`)
}