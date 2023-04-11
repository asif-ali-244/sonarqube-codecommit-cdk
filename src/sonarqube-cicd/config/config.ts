import { BuildSpec } from "aws-cdk-lib/aws-codebuild"
import { projectConfigProps } from "../sonarqube"

export const projectConfig: projectConfigProps[] = [
    {
        repository: "sonarqube-poc",
        token: "c587130a2b89c90c4f13e24f3afd28c41cb3c34b",
        host: "https://sonarcloud.io",
        organization: "sonarcloud-poc-presidio",
        project: "sonarqube-codecommit",
        codeBuildConfig: {
            buildSpec: BuildSpec.fromAsset(`${__dirname}/buildSpec/sonarqube.yml`)
        }
    }
]