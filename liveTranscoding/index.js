'use strict';

let webrtc = null;
let joined = false;

let $invite = $("#invite");

let $appid = $("#appid");
let $roomId = $("#roomId");
let $uid = $("#uid");
let $token = $("#token");
let $leave = $("#leave");
let $join = $("#join");
let $users = $("#users");
let $message = $("#message");
let $form = $("form");
let $audioDevice = $("#audio-device");
let $videoDevice = $("#video-device");
let $transcodingMode = $('#transcoding-mode');
let $transcodingUrl = $('#transcoding-url');
let $transcodingConfig = $('#transcoding-config');
let $setLiveTranscoding = $('#setLiveTranscoding');
let $addStreamUrl = $('#addPublishTranscodingStreamUrl');
let $playAddress = $('#play-address');
let TaskId = undefined;
let joinedUid = null;

const url = new URL(window.location);
let uAppid = url.searchParams.get('appid');
let uRoomId = url.searchParams.get('roomId');
let uToken = url.searchParams.get('token');
$appid.val(uAppid);
$roomId.val(uRoomId);
$token.val(uToken);
$invite.hide();
$uid.val(getRandomId());

const TranscodingModes = [
    [1, 320, 180], // mode, width, height
    [2, 320, 240],
    [3, 640, 360],
    [4, 640, 480],
    [5, 960, 544],
    [6, 1280, 720],
    [7, 1920, 1080],
];

let userLists = [];

async function init() {
    for (let item of TranscodingModes) {
        let mode = item[0];
        let width = item[1];
        let height = item[2];
        $transcodingMode.append(new Option(`${mode}: ${width}x${height}`, mode));
    }
    $transcodingMode.val(5);
    $transcodingUrl.val('rtmp://aliyun-live.upstream.yy.com/live/rtc_web_demo_' + getRandomId());
    updateTranscodingConfig();

    await getDevices();
    if (uAppid && uRoomId) {
        join();
    }
}

init();

$form.submit(async function (e) {
    e.preventDefault();
    await join();
});


async function join() {
    try {
        if (joined) {
            return;
        }
        let appId = parseInt($appid.val());
        if (isNaN(appId)) {
            warn('AppId must be number');
            return;
        }
        webrtc = new WebRTC(); // create WebRTC object


        let err = webrtc.init(appId); // init
        if (err === null) {
            console.log('init success');
        } else {
            warn(err.error);
            return;
        }

        let roomId = $roomId.val();

        // register event callback
        webrtc.on('remote_stream_add', async (ev, remoteStream) => {
            // subscribe remote stream
            await webrtc.subscribe(remoteStream);

            // create div for remote stream
            let divId = createUserDiv('remote-user-' + remoteStream.uid);

            // play remote stream
            await webrtc.play(remoteStream.uid, divId, {controls: true});

            addUserInfo(remoteStream.uid, remoteStream.roomId);
        });

        webrtc.on('remote_stream_remove', async (ev, remoteStream) => {
            removeUserDiv('remote-user-' + remoteStream.uid);
            removeUserInfo(remoteStream.uid);
        });

        $join.prop('disabled', true);

        let uid = $uid.val();
        let token = $token.val();
        if (token.length === 0) {
            token = undefined;
        }

        // join room
        joinedUid = await webrtc.joinRoom({
            uid: uid,
            roomId: roomId,
            token: token,
        });
        joined = true;
        $leave.attr('disabled', false);
        // create local stream
        let localStream = await webrtc.createStream({
            audio: {
                deviceId: $audioDevice.val(), // specific audio device
            },
            video: {
                deviceId: $videoDevice.val(), // specific video device
            }
        });
        let divId = createUserDiv('local-user-' + localStream.uid);
        await webrtc.play(localStream.uid, divId, {controls: true}); // play local stream
        await webrtc.publish(); // publish local stream
        addUserInfo(uid, roomId);
        TaskId = 'task_' + getRandomId();
        $setLiveTranscoding.prop('disabled', false);
        $invite.attr('href', `/rtc-web-demo/switchDevice/index.html?appid=${appId}&roomId=${roomId}`);
        $invite.show();
    } catch (e) {
        if (e && e.error) {
            warn(e.error);
        }
        if (webrtc) {
            webrtc.leaveRoom();
            joined = false;
            $leave.attr('disabled', true);
            $join.prop('disabled', false);
        }
    }
}

function leave() {
    if (!joined) {
        return;
    }
    webrtc.leaveRoom();
    $users.empty();
    $join.prop('disabled', false);
    $leave.prop('disabled', true);
    $invite.hide();
    joined = false;
    userLists = [];
    joinedUid = null;
    updateTranscodingConfig();
    $playAddress.empty();
}

$leave.click(() => {
    leave();
});


$setLiveTranscoding.click(() => {
    try {
        let config = JSON.parse($transcodingConfig.val());
        let err = webrtc.setLiveTranscodingTask(TaskId, config);
        if (err) {
            throw err;
        }
        $addStreamUrl.prop('disabled', false);
    } catch (e) {
        if (e.error) {
            warn(e.error);
        } else {
            warn(e);
        }
    }
});

$addStreamUrl.click(() => {
    try {
        let url = $transcodingUrl.val();
        let err = webrtc.addPublishTranscodingStreamUrl(TaskId, url);
        if (err) {
            throw err;
        }
        $playAddress.append(`<div>play address</div>`);
        $playAddress.append(`<div><span class="label label-info">${url.replace('upstream', 'downstream')}</span></div>`);
        $playAddress.append(`<div>You can use ffplay, VLC or this <a href='http://ossrs.net/players/srs_player.html' target="_blank">link</a> to play rtmp stream`);
        $addStreamUrl.prop('disabled', true);
    } catch (e) {
        if (e.error) {
            warn(e.error);
        } else {
            warn(e);
        }
    }
});


function createUserDiv(name) {
    let div = $("<div class='user'></div>").attr('id', name);
    let mediaId = 'media-' + name;
    let mediaDiv = $("<div class='media'></div>").attr('id', mediaId);
    div.append(`<span class="label label-info">${name}</span>`);
    div.append(mediaDiv);
    $users.append(div);
    return mediaId;
}

function removeUserDiv(name) {
    $("#" + name).remove();
}

function addUserInfo(uid, roomId) {
    userLists.push({
        uid: uid,
        roomId: roomId,
    });
    updateTranscodingConfig();
}

function removeUserInfo(uid) {
    userLists = userLists.filter(u => u.uid !== uid);
    updateTranscodingConfig();
}

$transcodingMode.change(() => {
    updateTranscodingConfig();
});

function updateTranscodingConfig() {
    let mode = Number($transcodingMode.val());
    let config = {
        transcodingMode: mode,
        userList: [],
    };
    let modeItem = TranscodingModes.filter(item => item[0] === mode)[0];
    let width = modeItem[1];
    let height = modeItem[2];
    let step = 0;
    if (userLists.length > 1) {
        step = Math.floor(width / userLists.length);
    }
    let layoutX = 0;
    for (let i = 0; i < userLists.length; i++) {
        let user = userLists[i];
        config.userList.push({
            layoutX: layoutX,
            layoutY: 0,
            layoutW: i === 0 ? width : step,
            layoutH: i === 0 ? height : Math.floor(height / 2),
            uid: user.uid,
            roomId: user.roomId,
        });
        layoutX += step;
    }
    $transcodingConfig.val(JSON.stringify(config, null, 2));
}

async function getDevices() {
    $audioDevice.empty();
    $videoDevice.empty();
    try {
        // can't get device label without permission.
        // set true to ask permission.
        let audioDevices = await WebRTC.getAudioDevices(true);
        let videoDevices = await WebRTC.getVideoDevices(true);
        audioDevices.forEach((device) => {
            $audioDevice.append(new Option(device.label, device.deviceId));
        });
        videoDevices.forEach((device) => {
            $videoDevice.append(new Option(device.label, device.deviceId));
        });
    } catch (e) {
        warn(e.error);
    }
}

$audioDevice.on('change', () => {
    if (webrtc && joinedUid && webrtc.hasAudio(joinedUid)) {
        webrtc.changeDevice('audio', $audioDevice.val());
    }
});

$videoDevice.on('change', () => {
    if (webrtc && joinedUid && webrtc.hasVideo(joinedUid)) {
        webrtc.changeDevice('video', $videoDevice.val());
    }
});

function warn(s) {
    $message.append(`<div class="alert alert-danger alert-dismissible" role="alert">
<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>${s}</div>`)
}

function getRandomId() {
    return Math.random().toString(36).slice(-8);
}
