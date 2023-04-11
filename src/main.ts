import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { projectConfig } from './sonarqube-cicd/config/config';
import { SonarQubeConstruct } from './sonarqube-cicd/sonarqube';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // define resources here...
    new SonarQubeConstruct(this, 'sonarqube', {
        config: projectConfig
    })
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'sonarqube-cicd-cdk-dev', { env: devEnv });
// new MyStack(app, 'sonarqube-cicd-cdk-prod', { env: prodEnv });

app.synth();