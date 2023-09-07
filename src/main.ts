import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { projectConfig } from './sonarqube-cicd/config/config';
import { SonarQubeConstruct } from './sonarqube-cicd/sonarqube';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // configure VPC properties below if already exist

    // const vpc = Vpc.fromLookup(this, 'vpc', {
    //     vpcId: 'vpc-09e293672ffa2b323'
    // })

    // const subnets = vpc.selectSubnets({
    //     subnetType: SubnetType.PRIVATE_WITH_EGRESS
    // }).subnets;

    // define resources here...
    new SonarQubeConstruct(this, 'sonarqube', {
        config: projectConfig,
        sonarCloud: false,
        // vpc,
        // privateSubnets: subnets,
        // onBranches: ["dev", "qa"]
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