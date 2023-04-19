# SonarQube integration with CodeCommit

SonarQube is an open-source platform for continuous code quality inspection, management, and analysis. With SonarQube, developers can identify potential issues and security vulnerabilities in their codebase and fix them before the code is deployed to production. This helps to improve the overall code quality and maintainability, as well as reduce the risk of security breaches and other issues down the line.

There are two kinds of solutions provided by SonarQube:

1. SonarCloud: SonarCloud is a cloud-based solution that provides continuous code quality management and analysis as a service. It is hosted and maintained by SonarSource, and users can access it through a web interface. This option is ideal for small teams or individual developers who do not want to manage their own infrastructure and want to get started quickly.
2. Self-hosted SonarQube: Self-hosted SonarQube is a solution that can be installed on-premises or in a private cloud. It provides the same functionality as SonarCloud, but users have more control over the deployment and maintenance of the platform. This option is ideal for larger teams or organizations that have strict security and compliance requirements or want to customize the platform to their specific needs.

In this application we have implemented both solutions.

## Commands

* `projen synth`: Synthesizes your cdk app into cdk.out
* `projen deploy`: Deploys your CDK app to the AWS cloud
* `projen destroy`: Destroys your cdk app in the AWS cloud

## PR Validation using SonarQube

Pull request validation is a part of CI pipeline that will be run whenever the PR is submitted. As a best practice, it is recommended that we run validation tests before merging the PR to the branch.

Code Commit natively doesn’t support running validation builds on creation of a pull request, we can however trigger a lambda function that can run a code build project that will behave as our validation build. The pull request status can then be updated according to the validation build, we can approve and safely merge the PR if the build passed.

When you create a PR it will trigger a codebuild project that would validate your PR using SonarQube Scanner. If the validation build passes, the PR will be approved and can be merged using the merge option on the PR. You can also watch the status of the validation build in the `Activity` tab of the PR.

![CodeCommit PR Validation Architecture](./images/PR%20Validation.png "CodeCommit PR Validation Architecture")

## Configuration

Include the configuration of your project/repositories that you want to scan in `sonarqube-cicd-cdk/src/sonarqube-cicd/config/config.ts`. You can put multiple repositories and the corresponding SonarQube configurations in the file using list of objects.
`sonarqube-cicd-cdk/src/sonarqube-cicd/config/buildSpec/sonarqube.yml` has the BuildSpec yml of the build that will run on PR creation.