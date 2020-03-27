var http = require('http');
var https = require('https');
var irc = require('irc');
var EventEmitter = require('events').EventEmitter;
var ee = new EventEmitter();
var fs = require('fs');
var crypto = require('crypto');
var exec = require('child_process').exec;

var botConfig = {
    twitch: {
        chat: {
            server:  'irc.chat.twitch.tv',
            nick:    'TrialsTrainBot',
            options: {
                password:   'oauth:',
                channels:   ['#trialstrainbot'],
                userName:   'TrialsTrainBot',
                showErrors: true
            }
        }
    },
    bot: {
        streamer: '',
        commands: {
            streamer: [
                'pov',
                'povreset',
                'afk'
            ],
            mods: [
                'afk',
                'play',
                'pov',
                'povreset'
            ],
            viewer: [
                'camera'
            ]
        },
        moderators: [],
        povVoteTimeout: 1200 * 1000,
        votingActive: false,
        chatterCount: 0,
        voters: {
            all: new Array(),
            pov1: new Array(),
            pov2: new Array(),
            pov3: new Array()
        },
        votes: {
            all: 0,
            pov1: 0,
            pov2: 0,
            pov3: 0,
            total: 0
        }
    },
    execs: {
        afk: 'AutoHotKey.exe afk.ahk',
        all: 'AutoHotKey.exe all.ahk',
        pov1: 'AutoHotKey.exe pov1.ahk',
        pov2: 'AutoHotKey.exe pov2.ahk',
        pov3: 'AutoHotKey.exe pov3.ahk'
    }
};

function CamBot(config) {
    var chat = new irc.Client(config.twitch.chat.server, config.twitch.chat.nick, config.twitch.chat.options);
    var channel = false;
    var votingInterval = false;
    var voteTimeout = false;
    var remindInterval = false;

    this.init = function() {
        setListeners();

    };

    function issueCommand(command, channel, user) {
        console.log("issueCommand args: ", command, channel, user);
        var cmd = command.split(' ');
        var action = cmd[0];
        ee.emit("bot-"+action+"Request", {cmd: command, channel: channel, user: user});
    }

    function setListeners() {
        chat.addListener("join", function (channel, nick, message) {
            console.log(arguments);

            chat.say(channel, '/color Firebrick');
            ee.emit("bot-joined", {channel: channel});
        });

        chat.addListener("message", function(from, to, text, message) {
            console.log("onChat: ", from, to, text);
            if(text.substr(0,1) == '!') {

                if(helpers.verifyCommand(text.substr(1), from)) {
                    console.log("EVT: verifyCommand: " + text.substr(1) + " for user: " + from);
                    issueCommand(text.substr(1),to,from, text, message);
                }
            }

        });

        Object.keys(listeners).forEach(function(listener, idx) {
            ee.on(listener, listeners[listener]);
        });
    }

    var listeners = {
        "bot-joined": function(data) {
            channel = data.channel;
            helpers.getChatterCount();
            helpers.setVoteMonitor();
        },
        "bot-cameraRequest": function(data) {
            console.log("cameraReq, data: " + data.cmd);
            if(config.bot.votingActive) {
                console.log("voting active");
                var command = data.cmd;
                var cmd = command.split(' ');
                console.log(cmd);
                if(!helpers.hasUserVotedAll(data.user) &&
                    !helpers.hasUserVotedPov1(data.user) &&
                    !helpers.hasUserVotedPov2(data.user) &&
                    !helpers.hasUserVotedPov3(data.user)) {
                    console.log("user has not voted yet");
                    console.log(typeof config.bot.voters[cmd[1]]);
                    if(typeof config.bot.voters[cmd[1]] !== 'undefined') {
                        config.bot.voters[cmd[1]].push(data.user);
                        config.bot.votes[cmd[1]]++;  
                        console.log("User added to: " + config.bot.voters[cmd[1]]);
                        chat.say(channel, "Votes for "+cmd[1]+": " + config.bot.votes[cmd[1]]);
                        console.log(JSON.stringify(config.bot.voters));
                        if(config.bot.votes[cmd[1]] >= config.bot.votes.total) {
                            config.bot.votingActive = false;
                            clearInterval(remindInterval);
                            ee.emit("voted", {voted: cmd[1], cmd: cmd});
                        }          
                    }
                    
                    
                }
                else {
                    console.log(console.log(JSON.stringify(config.bot.voters)));
                }
            }

        },
        "bot-povRequest": function(data) {
            config.bot.votes.total = 10;
            if(!config.bot.votingActive) {
                config.bot.votingActive = true;
                if(typeof remindInterval !== 'number') {
                    remindInterval = setInterval(function() {
                        chat.say(channel, "Voting is active! Use !camera {all / 1 / 2 / 3} to cast your vote! Votes" +
                            " needed: " + config.bot.votes.total + ". Current: All - "+config.bot.votes.all+", POV1 - "+config.bot.votes.pov1+", POV2 - "
                            +config.bot.votes.pov2+", POV3 - "+config.bot.votes.pov3);
                    }, 240000);
                }
                console.log("needed of chatters: " + 10);

                chat.say(channel, "Now taking voting requests for a new POV! Use !camera {all / 1 / 2 / 3} to cast your" +
                    " vote! Votes" +
                    " needed: " + config.bot.votes.total + ". Current: All - "+config.bot.votes.all+", POV1 - "+config.bot.votes.pov1+", POV2 - "
                    +config.bot.votes.pov2+", POV3 - "+config.bot.votes.pov3);
            }
            else {
                chat.say(channel, "@"+data.user+", voting is already active.");
            }

        },
        "bot-playingRequest": function(data) {
            console.log("playingReq, data: " + helpers.toString(data));
            var child = exec("AutoHotKey.exe all.ahk", function(err, stdout, stderr){
                if(err !== null) {
                    console.log(stderr);
                }
                console.log("we ran the all.exe", stdout);
            });
        },
        "bot-afkRequest": function(data) {
            console.log("afkReq, data: ", data.command);
            if(config.bot.votingActive) {
                config.bot.votingActive = false;
            }
            var child = exec("AutoHotKey.exe afk.ahk", function(err, stdout, stderr){
                if(err !== null) {
                    console.log(stderr);
                }
                console.log("we ran the afk.exe", stdout);
            });

        },
        "autoPovRequest": function(data) {
            config.bot.votingActive = true;
            config.bot.votes.total = 10;
            if(typeof remindInterval !== 'number') {
                remindInterval = setInterval(function() {
                    chat.say(channel, "Voting is active! Use !camera {all / lupo / ninja / ramblinnn} to cast your vote! Votes" +
                        " needed: " + config.bot.votes.total + ". Current: All - "+config.bot.votes.all+", POV1 - "+config.bot.votes.pov1+", POV2 - "
                        +config.bot.votes.pov2+", POV3 - "+config.bot.votes.pov3);
                }, 240000);
            }

            chat.say(channel, "Now taking voting requests for a new POV! Use !camera {all / lupo / ninja / ramblinnn} to cast your vote! Votes" +
                " needed: " + config.bot.votes.total + ". Current: All - "+config.bot.votes.all+", POV1 - "+config.bot.votes.pov1+", POV2 - "
                +config.bot.votes.pov2+", POV3 - "+config.bot.votes.pov3);
        },
        "voted": function(data) {
            var cam = data.voted;
            var cmd = data.cmd;
            config.bot.voters.all = [];
            config.bot.voters.pov1 = [];
            config.bot.voters.pov2 = [];
            config.bot.voters.pov3 = [];
            config.bot.votes.all = 0;
            config.bot.votes.pov1 = 0;
            config.bot.votes.pov2 = 0;
            config.bot.votes.pov3 = 0;
            chat.say(channel, "Vote passed! Switching to: '" + cmd[1] + "' POV! Voting starts again in 10 minutes.");

            var child = exec(config.execs[cmd[1]], function(err, stdout, stderr){
                if(err !== null) {
                    console.log(stderr);
                }
                console.log("we ran the afk.exe", stdout);
                helpers.setVoteTimeout();
            });
        },
        "bot-povresetRequest": function(data) {
            clearTimeout(voteTimeout);
            clearInterval(remindInterval);
            config.bot.votingActive = true;
            config.bot.voters.all = [];
            config.bot.voters.pov1 = [];
            config.bot.voters.pov2 = [];
            config.bot.voters.pov3 = [];
            config.bot.votes.all = 0;
            config.bot.votes.pov1 = 0;
            config.bot.votes.pov2 = 0;
            config.bot.votes.pov3 = 0;
        }
    };

    var helpers = {
        setVoteMonitor: function() {
            if(typeof votingInterval !== 'number') {
                votingInterval = setInterval(function() {
                    helpers.getChatterCount();
                }, 60000);
            }

        },
        setVoteTimeout: function() {
            if(typeof voteTimeout !== 'number') {
                setTimeout(function() {
                    clearTimeout(voteTimeout);
                    config.bot.votingActive = true;

                    ee.emit("autoPovRequest");

                }, 600000);
            }
        },
        isRequestPast20Mins: function(date1, date2) {
            return ((date2 - date1) > 1200);
        },
        verifyCommand: function(command, user) {
            var options = {
                host: 'tmi.twitch.tv',
                path: '/group/user'+config.bot.streamer+'/chatters'
            };
            http.get(options, function(response) {
                if(response.statusCode !== 200) {
                    console.error("error occurred when trying to get list of moderators! statusCode: " + response.statusCode);
                    return;
                }
                var body = '';
                response.on('data', function(d) {
                    body += d;
                });
                response.on('end', function() {
                    var chatters = JSON.parse(body);
                    config.bot.mods = chatters.chatters.moderators;
                });
            }).on('error', function(e) {
                console.error("error occurred when trying to get list of moderators: ", e);
            });

            console.log("verifyCommand: ", command, user);
            if(user.toLowerCase() == config.bot.streamer) {
                return true;
            }
            else if(config.bot.moderators.indexOf(user.toLowerCase()) !== -1) {
                var cmd = command.split(' ');
                return config.bot.commands.viewer.indexOf(cmd[0]) !== -1 || config.bot.commands.mods.indexOf(cmd[0]) !== -1;
            }
            else {
                var cmd = command.split(' ');
                return config.bot.commands.viewer.indexOf(cmd[0]) !== -1;
            }
        },
        getChatterCount: function() {
            var options = {
                host: 'tmi.twitch.tv',
                path: '/group/user'+config.bot.streamer+'/chatters'
            };
            http.get(options, function(response) {
                if(response.statusCode !== 200) {
                    console.error("error occurred when trying to get list of moderators! statusCode: " + response.statusCode);
                    return;
                }
                var body = '';
                response.on('data', function(d) {
                    body += d;
                });
                response.on('end', function() {
                    var chatters = JSON.parse(body);
                    config.bot.chatterCount = chatters.chatter_count;
                    config.bot.moderators = chatters.chatters.moderators;
                    console.log("chatterCount set to: " + config.bot.chatterCount);
                });
            }).on('error', function(e) {
                console.error("error occurred when trying to get list of moderators: ", e);
            });
        },
        hasUserVotedAll: function(user) {
            return config.bot.voters.all.indexOf(user) > -1;
        },
        hasUserVotedPov1: function(user) {
            return config.bot.voters.pov1.indexOf(user) > -1;
        },
        hasUserVotedPov2: function(user) {
            return config.bot.voters.pov2.indexOf(user) > -1;
        },
        hasUserVotedPov3: function(user) {
            return config.bot.voters.pov3.indexOf(user) > -1;
        }
    }
}

var camBot = new CamBot(botConfig);
camBot.init();
