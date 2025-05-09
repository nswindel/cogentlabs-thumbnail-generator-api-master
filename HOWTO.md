# Kuberenetes Cluster - Thumbnail Generator API

Thumbnail-generator is a JSON-based REST API service which resizes images into 100x100px thumbnails.

## Component Overview 

This kubernetes cluster is built and deployed using minikube for local development and includes:

- API Service / Express: Server library for node.
- Minio: S3 compatible API, used with the minio docker image.
- Agenda: Background jobs/queue, lightweight and works with mongo.
- MongoDB: Backend database that connects with Agenda. 
- Sharp: Popular and extremely easy to use image library.
- Helm: Package manager
- Prometheus: Monitoring + alerting
- PrometheusRules: Custom alerting

### Architecture

The queue worker and API docker containers have been split for scalability, since they can be deployed independently. 

The API docker container will create jobs via agenda, which will create a record in mongodb. For simplicity and ease of implementation, there is not clustering or HA implementation for the mongodb. Agenda running on the task servers will be periodically scanning for new jobs in the database, and process the thumbnails accordingly. This method means we can scale the number of workers easily.

Both parts store files in the minio/s3 bucket which would be serverless in production and therefore highly scalable. It also means there's no reason to worry about complexity from disk operations.

# Getting Started

Following has been installed and deployed on Ubuntu 24.04.2 LTS noble.

## Prerequisites

Ensure you have the following installed:

- Minkube: Follow the minikube documentation "Getting Started" making sure to meet all the prerequisites. 
- Docker - Used to build the thumbnail images locally.
- Helm - Used to deploy the application
- npm - package manager for Node.js

# Running the Cluster Locally

1. Start minikube
```
minikube start --driver=kvm2
eval $(minikube docker-env)
```

- Output should resemble the following:
```
$ minikube start --driver=kvm2
😄  minikube v1.35.0 on Ubuntu 24.04
✨  Using the kvm2 driver based on existing profile
👍  Starting "minikube" primary control-plane node in "minikube" cluster
🔄  Restarting existing kvm2 VM for "minikube" ...
🐳  Preparing Kubernetes v1.32.0 on Docker 27.4.0 ...
🔗  Configuring bridge CNI (Container Networking Interface) ...
🔎  Verifying Kubernetes components...
    ▪ Using image gcr.io/k8s-minikube/storage-provisioner:v5
🌟  Enabled addons: default-storageclass, storage-provisioner
🏄  Done! kubectl is now configured to use "minikube" cluster and "default" namespace by default
$
```

2. Make sure you are in root directory of the project:
```
:~/projects/cogentlabs-thumbnail-generator-api-master$ tree -L 1 -d
.
├── data
├── dist
├── helm
├── node_modules
└── src

6 directories
```

3. Do a sanity check of the package before building the image:
```
npm install
npm run build
npm run test
```

4. Build the thumbnail-api and thumbnail-task locally within the project as they are not available on a remote container registry
- thumbnail-api: NOTE: the default version should in the `./helm/thumbnail-app/values.yaml`
```
eval $(minikube docker-env)
docker build -t thumbnail-api:v1.0.0 .
```

- thumbnail-task
```
docker build -t thumbnail-task:v1.0.0 .
```

5. Ensure that the images are built and loaded into minikube.

- Connect to your minikube node
```
$ minikube ssh
```

- Confirm the images are available:
```
$ docker images | grep thumbnail | grep v1
thumbnail-api                                            v1.0.0     e1960635155d   14 hours ago    672MB
thumbnail-task                                           v1.0.0     e1960635155d   14 hours ago    672MB
$ 
```

# Deploying the service

The applications are deployed using helm.

## Monitoring stack

1. Install the prometheus stack using the community Helm chart.

```
helm install prometheus prometheus-community/kube-prometheus-stack --namespace=prometheus --create-namespace --wait
```
- Check the status:
```
$ kubectl get pods -n prometheus
NAME                                                     READY   STATUS    RESTARTS      AGE
alertmanager-prometheus-kube-prometheus-alertmanager-0   2/2     Running   2 (32m ago)   4d14h
prometheus-grafana-5455d5b7b-hcddr                       3/3     Running   3 (32m ago)   4d14h
prometheus-kube-prometheus-operator-545948b67d-gww9p     1/1     Running   1 (32m ago)   4d14h
prometheus-kube-state-metrics-7f9ff8bb6d-c6tfr           1/1     Running   1 (32m ago)   4d14h
prometheus-prometheus-kube-prometheus-prometheus-0       2/2     Running   2 (32m ago)   4d14h
prometheus-prometheus-node-exporter-pq2kd                1/1     Running   1 (32m ago)   4d14h
$
```

2. Make prometheus and grafana available externally to the minikube server by forwarding the relevant ports:
```
$ kubectl port-forward service/prometheus-prometheus-node-exporter 9100 --namespace=prometheus &
Forwarding from 127.0.0.1:9100 -> 9100
Forwarding from [::1]:9100 -> 9100
$ kubectl port-forward service/prometheus-operated  9090 --namespace=prometheus &
Forwarding from 127.0.0.1:9090 -> 9090
Forwarding from [::1]:9090 -> 9090
$ kubectl port-forward deployment/prometheus-grafana 3000 --namespace=prometheus &
Forwarding from 127.0.0.1:3000 -> 3000
Forwarding from [::1]:3000 -> 3000
```

3. Ensure prometheus and grafana is accessible from the browser:

- Prometheus: http://localhost:9090/query
- Grafana: http://localhost:3000 

## Thumbnail app

1. Confirm you are in the helm directory of the project, then install thumbnail app:

```
$ tree helm -L 1 -d
helm
└── thumbnail-app

2 directories
$
```

- Install the helm chart thumbnail-app 
```
$ helm install thumbnail-app ./thumbnail-app
```

- Check the status of the app by verifying all services and related pods are up:
```
$ kubectl get svc -o wide
NAME         TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE     SELECTOR
api          LoadBalancer   10.103.204.133   <pending>     3000:32178/TCP   11h     app=api
db           ClusterIP      10.100.16.218    <none>        27017/TCP        11h     app=db
kubernetes   ClusterIP      10.96.0.1        <none>        443/TCP          5d17h   <none>
s3           ClusterIP      10.107.130.22    <none>        9000/TCP         11h     app=s3
task         ClusterIP      10.103.31.65     <none>        3000/TCP         11h     app=task
$

$ kubectl get pods -o wide
NAME                   READY   STATUS    RESTARTS      AGE   IP             NODE       NOMINATED NODE   READINESS GATES
api-6849d4fcb-4pt4q    1/1     Running   1 (39m ago)   11h   10.244.1.91    minikube   <none>           <none>
api-6849d4fcb-fk74n    1/1     Running   1 (39m ago)   11h   10.244.1.97    minikube   <none>           <none>
db-bf6cd9f77-z5z97     1/1     Running   1 (39m ago)   11h   10.244.1.98    minikube   <none>           <none>
health-prober          1/1     Running   1 (39m ago)   11h   10.244.1.100   minikube   <none>           <none>
s3-85f48f9844-n2c79    1/1     Running   1 (39m ago)   11h   10.244.1.94    minikube   <none>           <none>
task-df7dc65bc-tppjb   1/1     Running   1 (39m ago)   11h   10.244.1.95    minikube   <none>           <none>
$
```

### Validate the installation

#### Submit a job to the api

1. From the root of the project, copy images to the minikube cluster:
```
$ minikube cp ./src/test/images/good_image_400x400.png /home/docker/good_image_400x400.png
$ minikube cp ./src/test/images/bad_image_actually_pdf.png /home/docker/bad_image_actually_pdf.png
 ```

2. Post a good image to the endpoint from within minikube as there is no ingress to the ClusterService IP:
- Determine the api svc endpoint:
```
$ kubectl get svc | grep api
api          LoadBalancer   10.111.204.44    <pending>     3000:30351/TCP   6m34s
$
```

- Connect to minikube
```
minikube ssh
                         _             _            
            _         _ ( )           ( )           
  ___ ___  (_)  ___  (_)| |/')  _   _ | |_      __  
/' _ ` _ `\| |/' _ `\| || , <  ( ) ( )| '_`\  /'__`\
| ( ) ( ) || || ( ) || || |\`\ | (_) || |_) )(  ___/
(_) (_) (_)(_)(_) (_)(_)(_) (_)`\___/'(_,__/'`\____)

$ 
```
- Run the curl command using the LoadBalance IP from the previous output:
```
$ IP=10.111.204.44
$ curl --silent --location --request POST "http://${IP}:3000/thumbnail" --form 'file=@"./good_image_400x400.png"'
{"data":{"job_id":"ab67e0db-3f6c-4eca-ae45-dc4a25123946"}}$ 
$
```
- Check the status of the job and verify is set to `"status": "complete"`
```
$ curl --location --request GET "http://${IP}:3000/thumbnail/ab67e0db-3f6c-4eca-ae45-dc4a25123946"
{
  "data": {
    "_id": "ab67e0db-3f6c-4eca-ae45-dc4a25123946",
    "filename": "ab67e0db-3f6c-4eca-ae45-dc4a25123946.png",
    "originalFilename": "good_image_400x400.png",
    "status": "complete",
    "thumbnailFilename": "100px_ab67e0db-3f6c-4eca-ae45-dc4a25123946.png",
    "thumbnailLink": "http://s3:9000/thumbnails/100px_ab67e0db-3f6c-4eca-ae45-dc4a25123946.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=someaccesskey%2F20250509%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250509T063025Z&X-Amz-Expires=604800&X-Amz-SignedHeaders=host&X-Amz-Signature=f482ee287dad9432ac93f2c27bd820d7577fae916674ad600b57f45c20e06ffb"
  }
}
```

# Observability and Monitoring

Prometheus scrapes api metrics from both thumbnail-api/metrics and node exporter via the daemonset.

## Verify api service targets are up in prometheus

Confirm the targets are up by visiting the prometheus dashboard: http://localhost:9090/targets. You cna also verify via the cli.

- Confirm the api pods are running:
```
$ kubectl get pods
NAME                   READY   STATUS    RESTARTS   AGE
api-75db6bf746-jp6x8   1/1     Running   0          24m
api-75db6bf746-vsfvb   1/1     Running   0          24m
....
<snip>
$
```

- Verify they targets are `up` emitting metrics:
```
$ for ip in `kubectl get pods -o wide | egrep api | grep -v probe | awk '{print $6}'`; do echo $ip ; ip="${ip}:3000"; curl -fs --data-urlencode "query=up{instance='${ip}'}" http://local
host:9090/api/v1/query? | jq ; done
10.244.1.139
Handling connection for 9090
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "__name__": "up",
          "container": "api",
          "endpoint": "http",
          "instance": "10.244.1.139:3000",
          "job": "api",
          "namespace": "default",
          "pod": "api-75db6bf746-jp6x8",
          "service": "api"
        },
        "value": [
          1746773145.522,
          "1"
        ]
      }
    ]
  }
}
10.244.1.142
Handling connection for 9090
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "__name__": "up",
          "container": "api",
          "endpoint": "http",
          "instance": "10.244.1.142:3000",
          "job": "api",
          "namespace": "default",
          "pod": "api-75db6bf746-vsfvb",
          "service": "api"
        },
        "value": [
          1746773145.539,
          "1"
        ]
      }
    ]
  }
}
```

# Health Probes & Init Containers

## Health Probes

A simple health probe pod exists for the api service which is used just to generate minute metrics for the api in prometheus.

 - `api-health-prober`: Does a simple curl of the `api:3000/health` .  


### InitContainers

InitContainers exist on the follow services:

- api: db and s3 services. 
  Note: I've put in a hack by initially sleeping for 30 seconds to avoid race conditions with the task service. It appeared every time the api service started prior to the task service, I always encountered network connectivity issues in the stack. 

- task: db and s3 services. The check iterates quicker than the api initContainers

Output during hem install shows api deploys after task (although not always guaranteed)
```
$ kubectl get pod
NAME                   READY   STATUS            RESTARTS   AGE
api-764cf64476-v95qv   0/1     Init:0/2          0          28s
api-764cf64476-xtcpq   0/1     Init:0/2          0          28s
api-health-prober      0/1     Init:0/1          0          28s
db-bf6cd9f77-4l94z     1/1     Running           0          28s
s3-85f48f9844-98cpk    1/1     Running           0          28s
task-df7dc65bc-szq8d   0/1     PodInitializing   0          28s
$
```

Task running before api pods are `Running` , with `api-health-probe` waiting on api pod:
```
$ kubectl get pod
NAME                   READY   STATUS     RESTARTS   AGE
api-764cf64476-v95qv   0/1     Init:1/2   0          61s
api-764cf64476-xtcpq   0/1     Init:1/2   0          61s
api-health-prober      0/1     Init:0/1   0          61s
db-bf6cd9f77-4l94z     1/1     Running    0          61s
s3-85f48f9844-98cpk    1/1     Running    0          61s
task-df7dc65bc-szq8d   1/1     Running    0          61s
$
```
## Availability monitoring

### Metrics

Prometheus Histogram & Counters include:

 - http_request_duration_milliseconds : Used to capture timers on requests

 - http_requests_total : Counter for http requests

 - http_requests_non_200_total: Counter for http responses != 200

 - failed_responses:

   Any response with "failed" returned back to the server.ts emits a metric counter. 
   Not the ideal solution and it should be captured within the route itself, not on `GET` requests. 
   It would also require implementation of categorizing other status != `complete`, however this is just for initial testing and as a first pass it's useful for testing the HighErrorRate alert.

   ```
   http_failed_responses_total{method="GET",route="/thumbnail/:id"} 4
   ```
Application/node metrics available at http://<pod-ip>:3000/metrics.

### Alerting

Availability monitor is defined, with the following rules/alerts being created:

1. Name: ServiceAvailability which is measured as a percentage of successful requests ie http response 200. 
   Definition: 
   ```
   (sum(rate(http_requests_non_200_total[5m])) / sum(rate(http_requests_total[5m]))) > 0.1
   ```
2. Name: HighErrorRate which is measured at a percentage of requests that returned a status of `failed` from the job ie submitting.
         For testing purposes the threshold is relaxed. The `/ 2` is due to double publishing of metrics in the server.ts and multiple calls in the /route.
   Definition: 
   ```
   (sum(rate(http_failed_responses_total[5m]) / 2) / sum(rate(http_requests_total[5m]))) > 0.05
   ```
3. Name: TargetUnavailabilityRate which tracks availability of targets and alerts if its below 60% over the last 5 minutes  
   Definition: 
   ```
   100 * (avg_over_time(up{job="api",namespace="default"}[5m])) < 60
   ```

#### Trigger the HighErrorRate alret

As mentioned above, doing a simple `GET` on a job which has a return status of "failed" will increment the counter.

First, get the api svc IP:
```
$ kubectl get service
NAME         TYPE           CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE
api          LoadBalancer   10.98.214.33     <pending>     3000:30431/TCP   7m7s
```

Execute the following with posts a bad image to the api, and the `GET` will increment the counter:
```
IP=10.98.214.33 ; echo $IP ; echo " " ; x=0 ; while [ $x -eq 0 ] ; do echo "Submitting job" ; JOB_ID=`curl --silent --location --request POST "http://${IP}:3000/thumbnail" --form 'file=@"./bad_image_actually_pdf.png"' | cut -d'"' -f6` ; echo " " ; echo "getting $JOB_ID" ; echo " " ; sleep 5 ; curl --location --request GET "http://${IP}:3000/thumbnail/$JOB_ID" ; y=0 ; while [ $y -ne 3 ] ; do echo " " ; echo "Getting health" ; curl "http://${IP}:3000/health" ;  curl "http://${IP}:3000/metrics" | grep -i fail ; echo " " ; y=$(($y + 1)) ; done ; done
```

Output after a few minutes:
```
# HELP http_failed_responses_total Total number of HTTP responses where app returned status: failed
# TYPE http_failed_responses_total counter
http_failed_responses_total{method="GET",route="/thumbnail/:id"} 82
```

- Check the prometheus dashboard http://localhost:9090/alerts and confirm the `HighErrorRate` has changed status to `firing`
- Check the query in prometheus which will show data:
```
(sum(rate(http_failed_responses_total[5m]) / 2) / sum(rate(http_requests_total[5m]))) > 0.05
0.1256544502617801
```

#### Trigger the HighErrorRate

# Updating the api deployment

- As a test, update the '/' path response in `src/server.ts` with the new version.
```
res.status(200).send({ data: 'Hello from Thumbnail Generator v1.0.2' });
```

- Do a simply build/test and check for errors:
```
$ npm run build
$ npm run test
```

Update the relevant files with the new release, in this case v1.0.2
```
helm/thumbnail-app/Chart.yaml
helm/thumbnail-app/values.yaml
```

- Build a new thumbnail-api and thumbnail-task with a new version
```
eval $(minikube docker-env)
docker build -t thumbnail-api:v1.0.2 .
docker build -t thumbnail-task:v1.0.2 .
```

- Connect to your minikube node and verify the images are there:
```
$ minikube ssh
$ docker images            
REPOSITORY                                               TAG        IMAGE ID       CREATED              SIZE
thumbnail-api                                            v1.0.2     bbdc95083c05   55 seconds ago   672MB
thumbnail-task                                           v1.0.2     bbdc95083c05   55 seconds ago   672MB
thumbnail-api                                            v1.0.1     f1fa14a30b32   20 minutes ago   672MB
thumbnail-task                                           v1.0.1     f1fa14a30b32   20 minutes ago   672MB
....<snip>
```

- Deploy the new version via either an upgrade, or a complete uninstall/install:
```
$ helm upgrade thumbnail-app ./thumbnail-app
```

- Version the app version has incremented
```
$ helm history thumbnail-app
REVISION        UPDATED                         STATUS          CHART                   APP VERSION     DESCRIPTION     
1               Fri May  9 17:18:54 2025        superseded      thumbnail-app-1.0.1     1.0             Install complete
2               Fri May  9 17:33:36 2025        deployed        thumbnail-app-1.0.2     1.0.2           Upgrade complete
$ 
```

- Confirm the new code has been pushed to an api host:
```
NAME                   READY   STATUS    RESTARTS   AGE     IP             NODE       NOMINATED NODE   READINESS GATES
api-764cf64476-4hg5n   1/1     Running   0          14m     10.244.1.155   minikube   <none>           <none>
```

- Curl '/' path:
```
$ curl http://10.244.1.155:3000 
{"data":"Hello from Thumbnail Generator v1.0.2"}$ 
```

## Rolling back

Using helm makes it easy to rollback. Using the output from the history above, simply provide the previous release:
```
helm rollback thumbnail-app 1 --namespace default
```