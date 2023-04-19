import { Aspects} from "aws-cdk-lib";
import { InstanceType, ISubnet, IVpc, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { ContainerImage, Secret, UlimitName } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import * as efs from "aws-cdk-lib/aws-efs";
import { AccessPoint } from "aws-cdk-lib/aws-efs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { AuroraPostgresEngineVersion, CfnDBCluster, Credentials, DatabaseCluster, DatabaseClusterEngine } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface SonarQubeServiceProps {
    vpc?: IVpc,
    vpcSubnets?: ISubnet[]
}

export class SonarQubeService extends Construct {
    private _sonarSecurityGroup: SecurityGroup
    public get sonarSecurityGroup() {
        return this._sonarSecurityGroup
    }
    constructor(scope: Construct, id: string, props: SonarQubeServiceProps) {
        super(scope, id);

        const dbSecurityGroup = new SecurityGroup(this, 'dbSecurityGroup', {
            vpc: props.vpc!,
            allowAllOutbound: true
        })

        this._sonarSecurityGroup = new SecurityGroup(this, 'sonarSecurityGroup', {
            vpc: props.vpc!,
            allowAllOutbound: true
        })

        dbSecurityGroup.addIngressRule(this._sonarSecurityGroup, Port.tcp(5432))

        const DB_USER = 'sonar'

        const serverlessCluster = new DatabaseCluster(this, 'sonarDb', {
            engine: DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_14_6 }),
            instanceProps: {
                vpc: props.vpc!,
                vpcSubnets: {
                    subnets: props.vpcSubnets
                },
                instanceType: new InstanceType('serverless'),
                securityGroups: [dbSecurityGroup]
            },
            credentials: Credentials.fromGeneratedSecret(DB_USER),
            defaultDatabaseName: "sonar",
            storageEncrypted: true,
            deletionProtection: false
        })

        Aspects.of(serverlessCluster).add({
            visit(node) {
                if (node instanceof CfnDBCluster) {
                    node.serverlessV2ScalingConfiguration = {
                        minCapacity: 1,
                        maxCapacity: 2,
                    }
                }
            },
        })

        const efsSecurityGroup = new SecurityGroup(this, 'efsSecurityGroup', {
            vpc: props.vpc!,
            allowAllOutbound: true
        })

        const fileSystem = new efs.FileSystem(this, 'sonarEFS', {
            vpc: props.vpc!,
            vpcSubnets: {
                subnets: props.vpcSubnets
            },
            securityGroup: efsSecurityGroup,
            lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS, // files are not transitioned to infrequent access (IA) storage by default
            performanceMode: efs.PerformanceMode.GENERAL_PURPOSE, // default
            outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS, // files are not transitioned back from (infrequent access) IA to primary storage by default
        });

        efsSecurityGroup.addIngressRule(this._sonarSecurityGroup, Port.tcp(2049))


        const accessPoint = new AccessPoint(this, 'nonRootAccessPoint', {
            fileSystem,
            path: '/opt/sonarqube',
            createAcl: {
                ownerGid: '1000',
                ownerUid: '1000',
                permissions: '777'
            },
            posixUser: {
                gid: '1000',
                uid: '1000'
            }
        })

        const mountPoints = [
            {
                containerPath: '/opt/sonarqube/extensions',
                volumeName: 'efs-sonarqube-extensions'
            },
            // {
            //     containerPath: '/opt/sonarqube/data',
            //     volumeName: 'efs-sonarqube-data'
            // },
            {
                containerPath: '/opt/sonarqube/logs',
                volumeName: 'efs-sonarqube-logs'
            }
        ]

        const service = new ApplicationLoadBalancedFargateService(this, 'fargate', {
            taskImageOptions: {
                image: ContainerImage.fromRegistry('sonarqube:lts'),
                command: ["-Dsonar.search.javaAdditionalOpts=-Dnode.store.allow_mmap=false"],
                containerPort: 9000,
                secrets: {
                    SONAR_JDBC_PASSWORD: Secret.fromSecretsManager(serverlessCluster.secret!, 'password'),
                    SONAR_JDBC_USERNAME: Secret.fromSecretsManager(serverlessCluster.secret!, 'username'),
                },
                environment: {
                    SONAR_JDBC_URL: `jdbc:postgresql://${serverlessCluster.clusterEndpoint.socketAddress}/sonar`
                }
            },
            cpu: 1024,
            listenerPort: 9000,
            memoryLimitMiB: 2048,
            securityGroups: [this._sonarSecurityGroup],
            taskSubnets: {
                subnets: props.vpcSubnets
            },
            vpc: props.vpc
        })

        mountPoints.forEach((mount) => {
            service.taskDefinition.addVolume({
                name: mount.volumeName,
                efsVolumeConfiguration: {
                    fileSystemId: fileSystem.fileSystemId,
                    authorizationConfig: {
                        accessPointId: accessPoint.accessPointId
                    },
                    transitEncryption: 'ENABLED'
                }
            })
            service.taskDefinition.defaultContainer?.addMountPoints(
                {
                    containerPath: mount.containerPath,
                    readOnly: false,
                    sourceVolume: mount.volumeName
                }
            )
        })

        service.taskDefinition.defaultContainer?.addUlimits(
            {
                softLimit: 131072,
                hardLimit: 131072,
                name: UlimitName.NOFILE
            },
            {
                name: UlimitName.NPROC,
                softLimit: 8192,
                hardLimit: 8192
            }
        )

        service.taskDefinition.executionRole?.addToPrincipalPolicy(new PolicyStatement({
            actions: [
                "elasticfilesystem:ClientMount",
                "elasticfilesystem:ClientWrite",
                "elasticfilesystem:ClientRootAccess"
            ],
            resources: [
                fileSystem.fileSystemArn
            ]
        }))
    }
}