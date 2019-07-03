FROM jrottenberg/ffmpeg:4.0-ubuntu

RUN mkdir /usr/src/nodemediaserver
WORKDIR /usr/src/nodemediaserver
RUN apt-get update
RUN apt-get -yqq install npm
RUN apt-get -yqq install curl
RUN apt-get -yqq install vim

RUN npm install n -g
RUN n 9.2.1

COPY . .
RUN npm i

ENTRYPOINT [ "node", "app"]

### Origin Start
#FROM node:10.15.0-alpine
#
#WORKDIR /usr/src/app
#
#COPY package*.json ./
#
#RUN npm i
#
#COPY . .
#
#EXPOSE 1935 8000
#
#CMD ["node","app.js"]
### Origin End

# docker run -it -p 1935:1935 -p 8000:8000 -p 8443:8443 -v $PWD/media/:/usr/src/nodemediaserver/media -d mynms
