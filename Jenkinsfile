pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 30, unit: 'MINUTES')
  }

  environment {
    REGISTRY_USER = 'rperdomo4'
    NAMESPACE     = 'alumno-team1'
    TAG           = "${env.BUILD_NUMBER}"
  }

  stages {
    stage('Tests del back') {
      steps {
        dir('back') {
          sh 'npm ci'
          sh 'npm test'
        }
      }
    }

    stage('Construir imágenes') {
      steps {
        sh 'docker build -t $REGISTRY_USER/lab-back:$TAG  -t $REGISTRY_USER/lab-back:latest  back'
        sh 'docker build -t $REGISTRY_USER/lab-front:$TAG -t $REGISTRY_USER/lab-front:latest front'
      }
    }

    stage('Subir a Docker Hub') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh 'echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin'
          sh 'docker push $REGISTRY_USER/lab-back:$TAG && docker push $REGISTRY_USER/lab-back:latest'
          sh 'docker push $REGISTRY_USER/lab-front:$TAG && docker push $REGISTRY_USER/lab-front:latest'
        }
      }
    }

    stage('Desplegar en el cluster') {
      steps {
        sh '''
          rm -rf out && mkdir out && cp k8s/app/*.yaml out/
          sed -i "s|lab-back:.*|lab-back:${TAG}|; s|lab-front:.*|lab-front:${TAG}|" out/*.yaml
          kubectl apply -n "$NAMESPACE" -f out/
          kubectl rollout status deployment/back  -n "$NAMESPACE" --timeout=300s
          kubectl rollout status deployment/front -n "$NAMESPACE" --timeout=300s
        '''
      }
    }
  }

  post {
    always { sh 'docker logout || true' }
  }
}
