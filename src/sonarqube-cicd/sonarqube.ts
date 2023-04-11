import { SecretValue } from "aws-cdk-lib";
import { ComputeType, LinuxBuildImage, Project, ProjectProps, Source } from "aws-cdk-lib/aws-codebuild";
import { IRepository, Repository } from "aws-cdk-lib/aws-codecommit";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { ApprovePRLambdaFunction } from "./approve_pr_lambda";
import { TriggerBuildLambdaFunction } from "./trigger_build_lambda";


export interface projectConfigProps {
    repository: string
    token: string
    host: string
    organization: string
    project: string
    codeBuildConfig?: ProjectProps
}

interface SonarQubeConstructProps {
    config: projectConfigProps[]
}

export class SonarQubeConstruct extends Construct {
    constructor(scope: Construct, id: string, props: SonarQubeConstructProps) {
        super(scope, id);

        const projectMap = new Map<IRepository, Project>();

        const projectConfig = props.config

        projectConfig.forEach((element) => {
            const repo = Repository.fromRepositoryName(this, `${element.repository}`, element.repository);

            // secret

            const secret = new Secret(this, `${element.repository}-sonarcloud-secret`, {
                secretObjectValue: {
                    sonar_token: SecretValue.unsafePlainText(element.token),
                    host: SecretValue.unsafePlainText(element.host),
                    organization: SecretValue.unsafePlainText(element.organization),
                    project: SecretValue.unsafePlainText(element.project)
                }
            })
            const project = new Project(this, `${element.repository}-sonarqube`, {
                ...element.codeBuildConfig,
                source: Source.codeCommit({ repository: repo }),
                environmentVariables: {
                    SECRET: {
                        value: secret.secretName
                    }
                },
                environment: {
                    buildImage: LinuxBuildImage.STANDARD_6_0,
                    computeType: ComputeType.MEDIUM
                },
                projectName: `${element.repository}-sonarqube`,
                description: `sonar scanner for ${element.repository}`,
            });
            projectMap.set(repo, project);
        })

        const { approvePrLambda } = new ApprovePRLambdaFunction(this, 'approve-pr-lambda', {
            projectMap
        });

        const { buildTriggerLambda } = new TriggerBuildLambdaFunction(this, 'trigger-build-lambda', {
            projectMap,
            approvePrLambda,
        });

        // event rules
        const pr_rule = new Rule(this, 'pr-event-rule', {
            description: 'A rule to trigger on pull requests creation/update for pr validation',
            eventPattern: {
                detailType: ['CodeCommit Pull Request State Change'],
                resources: Array.from(projectMap.keys()).map((repository) => repository.repositoryArn),
                source: ['aws.codecommit'],
                detail: {
                    event: ['pullRequestCreated', 'pullRequestSourceBranchUpdated'],
                },
            },
        });
        pr_rule.addTarget(new LambdaFunction(buildTriggerLambda));

        const pr_build_rule = new Rule(this, 'pr-build-rule', {
            description: 'A rule that responds to codebuild status for pr valiation',
            eventPattern: {
                detailType: ['CodeBuild Build State Change'],
                source: ['aws.codebuild'],
                detail: {
                    'project-name': Array.from(projectMap.values()).map((project) => project.projectName),
                    'build-status': [
                        'FAILED',
                        'SUCCEEDED',
                    ],
                },
            },
        });
        pr_build_rule.addTarget(new LambdaFunction(approvePrLambda));
    }
}