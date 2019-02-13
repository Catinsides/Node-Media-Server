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

# docker run -it -p 1935:1935 -p 8000:8000 -p 8443:8443 -v $PWD/media/:/usr/src/nodemediaserver/media -d mynms
