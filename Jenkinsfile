pipeline {
    agent any

    parameters {
        string(name: 'ROLLBACK_REF', defaultValue: '', description: 'Git ref (SHA, branch, tag) to rollback to. If specified, the pipeline will perform a rollback to this ref.')
    }

    environment {
        SNYK_TOKEN = credentials('snyk-token-id') // Snyk token credential configured in Jenkins
    }

    stages {
        stage('Rollback Preparation') {
            when {
                expression { params.ROLLBACK_REF != '' }
            }
            steps {
                echo "Rollback requested. Checking out ref: ${params.ROLLBACK_REF}"
                checkout([$class: 'GitSCM', branches: [[name: "${params.ROLLBACK_REF}"]]])
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Validation') {
            steps {
                parallel(
                    'Lint': {
                        sh 'npm run lint'
                    },
                    'Test': {
                        sh 'npx vitest run'
                    }
                )
            }
        }

        stage('Security Analysis') {
            steps {
                // Run Snyk scans for both Code SAST and Dependency Vulnerabilities
                catchError(buildResult: 'SUCCESS', stageResult: 'FAILURE') {
                    sh 'npx snyk test --severity-threshold=high'
                    sh 'npx snyk code test'
                }
            }
        }

        stage('Build Bundle') {
            steps {
                // Install Tauri system dependencies first
                sh 'sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev'
                sh 'npm run build'
            }
        }

        stage('Deploy') {
            steps {
                echo 'Deploying static assets to pages/production server...'
                // Insert specific cloud deployment commands here (e.g. AWS, Vercel, Netlify)
            }
        }
    }

    post {
        failure {
            echo 'Deployment failed! Recommended: Re-run build with parameters setting ROLLBACK_REF to the last successful release.'
        }
        success {
            echo 'Pipeline completed successfully!'
        }
    }
}
