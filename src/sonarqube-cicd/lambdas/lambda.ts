import { Duration } from "aws-cdk-lib";
import { Project } from "aws-cdk-lib/aws-codebuild";
import { IRepository } from "aws-cdk-lib/aws-codecommit";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

interface LambdaFunctionsProps {
    readonly projectMap: Map<IRepository, Project>;
}

export class LambdaFunctions extends Construct {
    private _approvePrLambda: NodejsFunction;
    private _buildTriggerLambda: NodejsFunction;
    public get approvePrLambda() {
        return this._approvePrLambda;
    }
    public get buildTriggerLambda() {
        return this._buildTriggerLambda;
    }
    constructor(scope: Construct, id: string, props: LambdaFunctionsProps) {
        super(scope, id);

        this._approvePrLambda = new NodejsFunction(this, 'approve_pr_lambda', {
            runtime: Runtime.NODEJS_16_X,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(15),
        });

        this._approvePrLambda.addToRolePolicy(
            new PolicyStatement({
                actions: [
                    'codecommit:PostCommentForPullRequest',
                    'codecommit:UpdatePullRequestApprovalState',
                ],
                resources: Array.from(props.projectMap.keys()).map((repository) => repository.repositoryArn),
            }),
        );

        // repo name and project build name mapping: push to ssm parameter

        let projectMapParameter: { [key: string]: string } = {};
        props.projectMap.forEach((value, key) => projectMapParameter[key.repositoryName] = value.projectName);
        const ssmParameter = new StringParameter(this, 'ProjectMap', {
            description: 'pr validation repo=>project map',
            parameterName: '/sonarQubeValidation/projectMap',
            stringValue: JSON.stringify(projectMapParameter),
        });

        this._buildTriggerLambda = new NodejsFunction(this, 'trigger_build_lambda', {
            environment: {
                BUILD_MAP_PARAMETER_NAME: ssmParameter.parameterName,
                APPROVER: `${this._approvePrLambda.role?.roleName}/${this._approvePrLambda.functionName}`,
            },
            runtime: Runtime.NODEJS_16_X,
            logRetention: RetentionDays.ONE_WEEK,
            timeout: Duration.minutes(15),
        });

        this._buildTriggerLambda.addToRolePolicy(
            new PolicyStatement({
                actions: ['codebuild:StartBuild'],
                resources: Array.from(props.projectMap.values()).map((project) => project.projectArn),
            }));

        this._buildTriggerLambda.addToRolePolicy(
            new PolicyStatement({
                actions: [
                    'codecommit:PostCommentForPullRequest',
                    'codecommit:CreatePullRequestApprovalRule',
                ],
                resources: Array.from(props.projectMap.keys()).map((repository) => repository.repositoryArn),
            }),
        );

        this._buildTriggerLambda.addToRolePolicy(
            new PolicyStatement({
                actions: [
                    'ssm:GetParameter',
                ],
                resources: [
                    ssmParameter.parameterArn,
                ],
            }),
        );
    }
}