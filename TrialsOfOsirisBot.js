var http = require('http');
var https = require('https');
var irc = require('irc');
var Twit = require('twit');
var EventEmitter = require('events').EventEmitter;
var ee = new EventEmitter();
var fs = require('fs');
var chokidar = require('chokidar');
var crypto = require('crypto');

var botConfig = {
    twitch: {
        chat: {
            server: 'irc.chat.twitch.tv',
            nick: 'TrialsTrainBot',
            options: {
                password: 'oauth:',
                channels: ['#trialstrainbot'],
                userName: 'TrialsTrainBot',
                showErrors: true
            }
        },
        whisper: {
            server: 'irc.chat.twitch.tv',
            port: 80,
            nick: 'TrialsTrainBot',
            options: {
                password: 'oauth:',
                channels: ['#trialstrainbot'],
                userName: 'TrialsTrainBot',
                showErrors: true
            }
        }
    },
    twitter: {
        consumer_key: "",
        consumer_secret: "",
        access_token: "",
        access_token_secret: "",
        timeout_ms: 60*1000
    },
    destiny: {
        apiKey: ''
    },
    bot: {
        streamer: '',
        mods: [

        ],
        cookie: {
            bungled: '',
            bungledid: '',
            bungleatk: '',
            bunglefrogblastventcore: '',
            bunglemsa: '',
            bungleme: '',
            changed: false,
            platform: '',
            path: './bungiecookie.txt'
        },
        guardian: {
            id: '',
            membershipId: '',
            membershipType: 1,
            characterId: ''
        },
        map: 'Unknown',
        card: {
            wins: 1,
            losses: -1,
            mercy: false,
            boon: false,
            latestCard: {
                hasTicket: false,
                wins: 0,
                losses: 0
            },
            boughtBoons: false,
            active: true
        },
        debug: false,
        commands: {
            streamer: [
                'win',
                'loss',
                'lh',
                'tweet',
                'highlight',
                'emotes',
                'scout'
            ],
            mods: [

            ],
            viewer: [
                'card',
                'emotes',
                'destiny',
                'map',
                'predict'
            ]
        },
        predictions: {
            active: false,
            endDate: '',
            players: {},
            announcement: false
        },
        destiny: {
            user10MinRequests:{},
            userHourlyRequests: {},
            user10MinTimeouts: {},
            userHourlyTimeouts: {},
            userHourlyTimestamps: {},
            user10MinTimestamps: {},
            user10MinNotify: {}
        },
        highlightRequested: false,
        emotes: ''
    }
};


function TrialsOfOsirisBot(config) {
    var chat = new irc.Client(config.twitch.chat.server, config.twitch.chat.nick, config.twitch.chat.options);
    var whisper = new irc.Client(config.twitch.whisper.server, config.twitch.whisper.nick, config.twitch.whisper.options);
    var twitter = new Twit(config.twitter);
    var destiny = require('destiny-client')(config.destiny.apiKey);
    var cardMonitorInterval = false;
    var statusMonitorInterval = false;
    var takingPredictionsInterval = false;
    var channel = false;


    var listeners = {
        "bot-joined": function(data) {
            console.log("EVT: bot-joined, data rcvd: " + helpers.toString(data));
            channel = data.channel;
            helpers.setGuardianMembershipAndCharacter(function(guardian) {
                helpers.setTrialsStatusMonitor(helpers.getStatusOfTrialsOfOsiris);

            });

        },
        "bot-highlightRequest": function(data) {
            console.log("EVT: bot-highlightRequested, data rcvd: " + helpers.toString(data));
            config.bot.highlightRequested = true;

        },
        "bot-lhRequest": function(data) {
            console.log("EVT: bot-virginCheck, data rcvd: " + helpers.toString(data));
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            var gamertag = helpers.buildGamertag(command);
            helpers.getMembershipAndCharacterIdsByGamertag(gamertag, function(membershipId, characterId, membershipType){
                console.log("EVT: bot-lhRequest, callback args: ", arguments);
                virginity(membershipId, membershipType, gamertag, user, function(message) {
                    chat.say(channel, message);
                });
            });

        },
        "bot-scoutRequest": function(data) {
            console.log("EVT: bot-scoutRequest, data rcvd: " + helpers.toString(data));
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            var gamertag = helpers.buildGamertag(command);

            helpers.getMembershipAndCharacterIdsByGamertag(gamertag, function(membershipId, characterId, membershipType) {
                console.log("scoutRequest: found player info: ", membershipId, characterId, membershipType);
                scout(gamertag, membershipType, membershipId, characterId, user, function(message) {
                    if(message.substr(0, 4) !== 'err:') {
                        chat.say(channel, message);
                    }
                });
            });

        },
        "bot-destinyRequest": function(data) {
            console.log("EVT: bot-destinyRequest, data rcvd: " + helpers.toString(data));
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            var cmd = command.split(' ');
            var query = command.replace('destiny ', '');

            var actionToSend = false;
            var gamerTagToSend = false;
            var platformToSend = false;
            var requestApproved = false;
            var check10Mins = true;
            var checkHourly = true;
            var sendToChat = false;
            console.log("user: "+user+" requested: " + cmd);
            if(cmd[1]) {
                actionToSend = cmd[1];
            }
            if(cmd[2]) {
                gamerTagToSend = cmd[2];
            }
            if(cmd[3]) {
                platformToSend = cmd[3];
            }

            if(!actionToSend && !gamerTagToSend && !platformToSend) {
                requestApproved = true;
                check10Mins = false;
                checkHourly = false;
            }

            if(query.length < 1) {
                requestApproved = true;
                check10Mins = false;
                checkHourly = false;
            }

            if(actionToSend == 'pvp' || actionToSend == 'pve') {
                requestApproved = true;
            }

            if(user === 'drlupo' || user === 'nightbot') {
                requestApproved = true;
                sendToChat = true;
            }

            if(typeof config.bot.destiny.user10MinTimestamps[user] === 'undefined') {
                config.bot.destiny.user10MinTimestamps[user] = 0;
                console.log("user: "+user+" was not in the 10MinTimestamps obj, added");
            }
            if(typeof config.bot.destiny.userHourlyTimestamps[user] == 'undefined') {
                config.bot.destiny.userHourlyTimestamps[user] = 0;
                console.log("user: "+user+" was not in the HourlyTimestamps obj, added");
            }
            if(typeof config.bot.destiny.userHourlyRequests[user] === 'undefined') {
                config.bot.destiny.userHourlyRequests[user] = 0;
                console.log("user: "+user+" was not in the HourlyRequests obj, added");
            }
            if(typeof config.bot.destiny.user10MinNotify[user] === 'undefined') {
                config.bot.destiny.user10MinNotify = false;
            }

            console.log(config.bot.destiny.userHourlyTimestamps, config.bot.destiny.user10MinTimestamps);
            if((user !== 'drlupo' || user !== 'nightbot') && check10Mins) {
                if(helpers.isRequestPast10Mins(config.bot.destiny.user10MinTimestamps[user], new Date().getTime() / 1000)) {
                    console.log("user: "+user+" has not requested in the last ten minutes");
                    if(checkHourly) {
                        if(helpers.isRequestPastHour(config.bot.destiny.userHourlyTimestamps[user], new Date().getTime() / 1000)) {
                            requestApproved = true;
                        }
                        else {
                            console.log("user: "+user+" has requested within the last hour, checking number of requests...");
                            if(config.bot.destiny.userHourlyRequests[user] < 3) {
                                //TODO: NUMREQUESTS - just in case we need to change number of hourly requests, they are here
                                console.log(config.bot.destiny.userHourlyRequests);
                                console.log("user: "+user+" has requested " + config.bot.destiny.userHourlyRequests[user] + " times");
                                requestApproved = true;
                            }
                            else {
                                console.log(config.bot.destiny.userHourlyRequests);
                                console.log("user: "+user+" has exceeded 3 requests within the last hour");
                            }
                        }
                    }
                    else {
                        requestApproved = true;
                    }
                }
                else {
                    console.log("user: "+user+" has already requested within the last 10 minutes");
                    var tenMinsFromRequest = (config.bot.destiny.user10MinTimestamps[user] * 1000) + (600000);

                    //TODO: INTERVAL - just in case we need to change interval, it's here
                    var remaining = helpers.getRequestTimeRemaining(tenMinsFromRequest, config.bot.destiny.user10MinTimestamps[user]*1000);
                    console.log(remaining);
                    if(!config.bot.destiny.user10MinNotify[user]) {
                        whisper.say('#trialstrainbot', "/w "+user+"  "+user+", please wait 10 minutes between !destiny requests. Remaining: "+remaining.minutes+"m:"+remaining.seconds+"s");
                    }

                    config.bot.destiny.user10MinNotify[user] = true;
                }
            }
            else {
                requestApproved = true;
            }

            if(requestApproved) {
                if(user !== config.bot.streamer || user !== 'nightbot') {
                    config.bot.destiny.userHourlyTimestamps[user] = new Date().getTime() / 1000;
                    config.bot.destiny.user10MinTimestamps[user] = new Date().getTime() / 1000;
                    config.bot.destiny.userHourlyRequests[user]++;
                }

                helpers.retrieveDestinyStats2(user, query, channel);
            }

        },
        "bot-cardFinished": function(data) {
            console.log("EVT: bot-cardFinished, data rcvd: " + helpers.toString(data));

        },
        "bot-resetRequest": function(data) {
            console.log("EVT: bot-cardReset, data rcvd: " + helpers.toString(data));
            config.bot.card.wins = 1;
            config.bot.card.losses = 0;
            config.bot.card.boon = false;
            config.bot.card.mercy = false;
            config.bot.card.latestCard.hasTicket = true;
            config.bot.card.latestCard.wins = 0;
            config.bot.card.latestCard.losses = 0;
            chat.say(data.channel, '/me @' + data.user + ' , Passage Card has been reset!');

            clearInterval(cardMonitorInterval);
            helpers.setTrialsCardMonitor(helpers.getStatusOfTrialsCard);
        },
        "bot-cardRequest": function(data) {
            console.log("EVT: bot-cardRequest, data rcvd: " + helpers.toString(data));
            console.log("cardRequest, current card: " + helpers.toString(config.bot.card));
            var losses;
            if(config.bot.card.active) {
                if(config.bot.card.losses < 1) {
                    losses = 0;
                } else {
                    losses = config.bot.card.losses;
                }
                chat.say(data.channel, '/me @'+data.user+', the current Passage Card is: ' + config.bot.card.wins + 'W / ' + losses + 'L, Mercy Used: ' + config.bot.card.mercy + '. Results are near real-time.');
            }

        },
        "bot-predictRequest": function(data) {

            var command = data.cmd,
                channel = data.channel,
                user = data.user,
                action = data.action;
            console.log("EVT: bot-predictRequest, data rcvd: " + helpers.toString(data));

            if(config.bot.predictions.active) {
                var timeToTrialsStart;
                if(config.bot.predictions.endDate.length > 0) {
                    timeToTrialsStart = helpers.getTimeRemaining(config.bot.predictions.endDate);
                    console.log("time to trials start: ", timeToTrialsStart);
                }
                var cmd = command.split(' ');
                if(cmd.length > 1) {
                    console.log("we are updating the emotes list");
                    var mloops = cmd.length - 1; // minus 1 because the first one is the command that comes through
                    var map = '';
                    if(!config.bot.predictions.players[user.toLowerCase()]) {
                        for (var z = 1; z <= mloops; z++) {
                            console.log(cmd[z]);
                            map = map + ' ' + cmd[z];
                        }
                        map = map.trim();
                        config.bot.predictions.players[user.toLowerCase()] = map;
                        console.log("added player to predictions list: ", config.bot.predictions.players[user.toLowerCase()]);
                        chat.say(channel, ' @'+user+', your map prediction of: "'+map+'" has been recorded! Taking predictions for another: ' + timeToTrialsStart.hours + "H:"+timeToTrialsStart.minutes+"M:"+timeToTrialsStart.seconds+"S");
                    }
                    else {
                        for (var y = 1; y <= mloops; y++) {
                            console.log(cmd[y]);
                            map = map + ' ' + cmd[y];
                        }
                        map = map.trim();
                        if(map.toLowerCase() == config.bot.predictions.players[user.toLowerCase()].toLowerCase()) {
                            chat.say(channel, ' @'+user+', you already predicted: ' + config.bot.predictions.players[user.toLowerCase()]);
                        } else {
                            config.bot.predictions.players[user.toLowerCase()] = map;
                            chat.say(channel, ' @'+user+', you have changed your prediction to: "' + map + '". Taking predictions for another: ' + timeToTrialsStart.hours + "H:"+timeToTrialsStart.minutes+"M:"+timeToTrialsStart.seconds+"S");
                        }
                    }
                }
                else {
                    chat.say(channel, 'Want some pre-Trials fun? Enter your map predictions and when Trials goes live, I will announce the' +
                        ' map and all the correct predictors! Good luck! (ex: !predict Widow\'s Court) Taking predictions for another: ' + timeToTrialsStart.hours + "H:"+timeToTrialsStart.minutes+"M:"+timeToTrialsStart.seconds+"S");
                }
            }
        },
        "autoWin": function(data) {
            console.log("EVT: autoWin, data rcvd: " + helpers.toString(data.card));
            var losses;
            if(config.bot.card.boughtBoons) {
                config.bot.card.wins = data.card.wins;
            }
            else {
                config.bot.card.wins += (!config.bot.boon) ? 2 : 1;
                config.bot.boon = true;
            }


            if(config.bot.card.losses < 1) {
                losses = 0;
            } else {
                losses = config.bot.card.losses;
            }
            setTimeout(function() {
                chat.say(channel, "/me Victory! @"+ config.bot.streamer+"'s team won! Passage Card: " + config.bot.card.wins + "W - " + losses + "L - Mercy used: " + config.bot.card.mercy + ". Results" +" are near real-time.");
            }, 15000);

            if(config.bot.card.wins == 9) {
                clearInterval(cardMonitorInterval);
                helpers.setTrialsCardMonitor(helpers.getStatusOfTrialsCard);

            }
        },
        "bot-winRequest": function(data) {
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            if(config.bot.card.boughtBoons) {
                config.bot.card.wins = data.card.wins;
            }
            else {
                config.bot.card.wins += (!config.bot.boon) ? 2 : 1;
                config.bot.boon = true;
            }


            if(config.bot.card.losses < 1) {
                losses = 0;
            } else {
                losses = config.bot.card.losses;
            }
            chat.say(channel, "/me @"+ config.bot.streamer+", win recorded. Passage Card: " + config.bot.card.wins + "W - " + losses + "L - Mercy used: " + config.bot.card.mercy + ".");
        },
        "autoLoss": function(data) {
            console.log("EVT: bot-lossSet, data rcvd: " + helpers.toString(data));
            var losses = 0;

            if(!config.bot.card.mercy) {
                config.bot.card.mercy = true;
                config.bot.card.losses = 0;
                losses = 0;
            }
            else {
                config.bot.card.losses += 1;
                losses += 1;
            }

            setTimeout(function() {
                chat.say(channel, "/me Defeat! @"+ config.bot.streamer+"'s team lost. :( Passage Card: " + config.bot.card.wins + "W - " + losses + "L - Mercy used: " + config.bot.card.mercy + ". Results" +" are near real-time.");
            }, 15000);
        },
        "bot-lossRequest": function(data) {
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            console.log("EVT: bot-lossSet, data rcvd: " + helpers.toString(data));
            var losses = 0;

            if(!config.bot.card.mercy) {
                config.bot.card.mercy = true;
                config.bot.card.losses = 0;

            }
            else {
                config.bot.card.losses += 1;
                losses += 1;
            }

            chat.say(channel, "/me Defeat! @"+ config.bot.streamer+"'s team lost. :( Passage Card: " + config.bot.card.wins + "W - " + losses + "L - Mercy used: " + config.bot.card.mercy + ".");
        },
        "bot-addmapRequest": function(data) {
            console.log("EVT: bot-mapSet, data rcvd: " + helpers.toString(data));

        },
        "bot-mapRequest": function(data) {
            var user = data.user;
            console.log("EVT: bot-mapRequest, data rcvd: " + helpers.toString(data));
            chat.say(channel, '@' + user +', the map this weekend is: ' + config.bot.map);

        },
        "bot-emotesRequest": function(data) {
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            cmd = command.split(' ');
            console.log("EVT: bot-emotesRequest, data rcvd: " + helpers.toString(data));
            if(cmd.length > 1) {
                console.log("we are updating the emotes list");
                if(user.toLowerCase() == config.bot.streamer || user.toLowerCase() == ttConfig.theAdmin) {
                    var eloops = cmd.length - 1; // minus 1 because the first one is the command that comes through
                    console.log("eloops: "+eloops);
                    var emotes = '';
                    for (var j = 1; j <= eloops; j++) {
                        console.log(cmd[j]);
                        emotes = emotes + ' ' + cmd[j];

                    }
                    config.bot.emotes = emotes;
                    chat.say(channel, ' @'+user+', Subscriber Emotes Updated! ' + emotes);
                }
            }
            else {
                chat.say(channel, ' @'+user+', Subscriber Emotes for DrLupo are: ' + config.bot.emotes);
            }
        },
        "bot-tweetRequest": function(data) {
            console.log("EVT: bot-tweetRequest, data rcvd: " + helpers.toString(data));
            var command = data.cmd,
                channel = data.channel,
                user = data.user;
            var tweetStatus = helpers.buildGamertag(command);

            if(tweetStatus.length < 141) {

                twitter.post('statuses/update', {status: tweetStatus}, function(error, tweet, response){
                    console.log("tweet response: ", arguments);
                    if(typeof error === 'undefined') {
                        chat.say(channel, '@' + user + ', Tweet posted successfully. Link: https://twitter.com/TheTrialsTrain/status/' + tweet.id_str);
                    }
                });
            } else {
                chat.say(channel, "@" + user+", the Tweet is longer than 140 characters.");
            }

        },
        "bot-cookieFileRead": function(data) {
            console.log("EVT: bot-cookieFileRead, data rcvd: " + data);
            if(data.fileData === '1') {
                return;
            }

            var jsonCookie = JSON.parse(data.fileData);
            if(!jsonCookie.bungleatk) {
                return;
            }

            console.log("event bot-cookieFileRead: " + jsonCookie);

            config.bot.cookie.changed = !config.bot.bungieCookie.changed;
            config.bot.cookie.bungleatk = jsonCookie.bungleatk;
            config.bot.cookie.bungled = jsonCookie.bungled;
            config.bot.cookie.bungledid = jsonCookie.bungledid;
            config.bot.cookie.bunglemsa = jsonCookie.bunglemsa;
            config.bot.cookie.bungleme = jsonCookie.bungleme;
            config.bot.cookie.bunglefrogblastventcore = jsonCookie.bunglefrogblastventcore;
            config.bot.cookie.platform = jsonCookie.method;
            if(jsonCookie.method === 'psn') {
                config.bot.guardian.membershipType = 2;
                config.bot.guardian.id = 'DrLupo-';
            }
        },
        "trialsStarted": function(data) {
            var trials = data.trials;
            ee.emit("announceTrialsMap", {map: trials.display.flavor});
            config.bot.predictions.active = false;
            config.bot.predictions.players = {};
            if(typeof takingPredictionsInterval == 'number') {
                clearInterval(takingPredictionsInterval);
            }
            config.bot.map = trials.display.flavor;
            config.bot.card.active = true;
            helpers.setTrialsCardMonitor(helpers.getStatusOfTrialsCard);
        },
        "announceTrialsMap": function(data) {
            console.log("About to announce the new Trials map, " + data.map);

            if(!config.bot.predictions.announcement) {
                chat.say(channel, "/me Trials of Osiris has started! The map this weekend is: " + data.map);
                config.bot
                var predictionWinners = helpers.getListOfPredictionWinners(data.map);
                chat.say(channel, predictionWinners);
                config.bot.predictions.announcement = true;
            }

            config.bot.map = data.map;
        },
        "startTakingPredictions": function(data) {
            console.log("evt-startTakingPredictions received, data: ", helpers.toString(data));
            
            console.log("predictions config: ", helpers.toString(config.bot.predictions), helpers.toString(config.bot.predictions.players));
            if(!config.bot.predictions.active) {
                config.bot.predictions.active = true;
                takingPredictionsInterval = setInterval(function() {

                    var timeRemaining = helpers.getTimeRemaining(config.bot.predictions.endDate);
                    console.log("in sTP event: ", helpers.toString(timeRemaining));
                    chat.say(channel, 'Use !predict {map name} to set your prediction for the Trials map! Taking predictions for' +
                        ' another: ' + timeRemaining.hours + 'H:' + timeRemaining.minutes + 'M:'+timeRemaining.seconds+'S');
                }, 180000);
            }

        }
    };

    this.init = function() {
        setListeners();
        setBungieCookie();
        watchBungieCookie();

    };

    var setListeners = function() {

        chat.addListener("join", function (channel, nick, message) {
            console.log(arguments);
            chat.say(channel, '/color Firebrick');
            ee.emit("bot-joined", {channel: channel});
        });

        chat.addListener("message", function(from, to, text, message) {
            console.log("onChat: ", from, to, text);
            if(from.toLowerCase() == 'nightbot') {
                if(config.bot.highlightRequested) {
                    config.bot.highlightRequested = !config.bot.highlightRequested;
                    var stamp = helpers.localToCentral();
                    console.log(stamp + " - highlight requested for: " + text);
                    fs.writeFile('./highlights.txt', stamp + " - " + text, function(err) {
                        console.log(err);
                    });
                }
                console.log(text);
            }
            else {
                if(text.substr(0,1) == '!') {

                    if(helpers.verifyCommand(text.substr(1), from)) {
                        console.log("EVT: verifyCommand: " + text.substr(1) + " for user: " + from);
                        issueCommand(text.substr(1),to,from, text, message);
                    }
                }
            }
            
        });

        chat.addListener('raw', function(message) {
            //console.log("RCVD: raw, " + helpers.toString(message));
        });

        chat.addListener("action", function(from, to, text, message) {
            console.log("EVT: chatAction, " + message);
        });

        chat.addListener("error", function(error) {
            console.log("ERROR !!! :: ", error);
        });

        ee.on("newListener", function(evt) {
            console.log("New listener: " + evt);
        });

        ee.on("removeListener", function(evt) {
            console.log("Removed listener: " + evt);
        });
        Object.keys(listeners).forEach(function(listener, idx) {
            ee.on(listener, listeners[listener]);
        });

        //ee.once("trialsStarted", listeners["trialsStarted"]);

    };

    var helpers = {
        setTrialsStatusMonitor: function(callback) {
            if(typeof statusMonitorInterval !== 'number') {
                var trialsCardReqOptions = {
                    headers: {
                        "X-API-Key": config.destiny.apiKey,
                        "Cookie":    "bungleatk=" + config.bot.cookie.bungleatk + "; bungled=" + config.bot.cookie.bungled + "; bungledid=" + config.bot.cookie.bungledid + "; bunglemsa=" + config.bot.cookie.bunglemsa + "; bunglefrogblastventcore=" + config.bot.cookie.bunglefrogblastventcore + "; bungleme=" + config.bot.cookie.bungleme + "; ",
                        "X-CSRF":    config.bot.cookie.bungled
                    },
                    host:    'www.bungie.net',
                    path:    '/Platform/Destiny/' + config.bot.guardian.membershipType + '/Account/' + config.bot.guardian.membershipId + '/Character/' + config.bot.guardian.characterId + '/Advisors/V2/'
                };
                statusMonitorInterval = setInterval(function() {
                    https.get(trialsCardReqOptions, function (response) {
                        if(response.statusCode !== 200) {
                            console.error("error occurred when trying to get status of Trials! statusCode: " + response.statusCode, response);
                            return;
                        }
                        var body = '';
                        response.on('data', function (d) {
                            body += d;
                        });
                        response.on('end', function () {

                            try {
                                callback(JSON.parse(body));
                            } catch(e) {
                                console.error("error when retrieving trials status: ", e);
                            }


                        });
                    }).on('error', function(e) {
                        console.error("error occurred when trying to get status of Trials: ", e);
                    });
                }, 10000);
            }
        },

        setTrialsCardMonitor: function(callback) {
            if(typeof cardMonitorInterval !== 'number') {
                var trialsCardReqOptions = {
                    headers: {
                        "X-API-Key": config.destiny.apiKey,
                        "Cookie":    "bungleatk=" + config.bot.cookie.bungleatk + "; bungled=" + config.bot.cookie.bungled + "; bungledid=" + config.bot.cookie.bungledid + "; bunglemsa=" + config.bot.cookie.bunglemsa + "; bunglefrogblastventcore=" + config.bot.cookie.bunglefrogblastventcore + "; bungleme=" + config.bot.cookie.bungleme + "; ",
                        "X-CSRF":    config.bot.cookie.bungled
                    },
                    host:    'www.bungie.net',
                    path:    '/Platform/Destiny/' + config.bot.guardian.membershipType + '/Account/' + config.bot.guardian.membershipId + '/Character/' + config.bot.guardian.characterId + '/Advisors/V2/'
                };

                cardMonitorInterval = setInterval(function () {
                    https.get(trialsCardReqOptions, function (response) {
                        if(response.statusCode !== 200) {
                            console.error("error occurred when trying to get status of card! statusCode: " + response.statusCode);
                            return;
                        }
                        var body = '';
                        response.on('data', function (d) {
                            body += d;
                        });
                        response.on('error', function(e) {
                            console.log("Error in pulling card: ", e);
                        });
                        response.on('end', function () {

                            try {
                                callback(JSON.parse(body));
                            } catch(e) {
                                console.error("error occurred when trying to get status of card: ", e);
                            }
                        });
                    }).on('error', function(e) {
                        console.error("error occurred when trying to get status of card: ", e);
                    });
                }, 10000);
            }
        },
        getStatusOfTrialsOfOsiris: function(json) {

            var trials = json.Response.data.activities.trials;
            console.log(trials);
            if(trials.status.active) {
                config.bot.map = trials.display.flavor;
                if(!config.bot.card.active) {
                    console.log("Trials Started, Map: " + trials.display.flavor);
                    ee.emit("trialsStarted", {trials: trials});
                }
            }
            else {
                console.log("Trials has not started yet.");
                config.bot.map = 'Unknown';
                config.bot.card.active = false;
                config.bot.predictions.endDate = '2016-07-01T17:00:00Z' //trials.status.startDate;
                var timeRemaining = helpers.getTimeRemaining(config.bot.predictions.endDate);
                //console.log("time remaining until trials starts: "+ timeRemaining.total+"total, "+timeRemaining.days+"D:"+timeRemaining.hours+"H:"+timeRemaining.minutes+"M:"+timeRemaining.seconds+"S");
                console.log(helpers.toString(helpers.getTimeRemaining(config.bot.predictions.endDate)));

                if(timeRemaining.total > 0) {
                    if(timeRemaining.days == 0 && timeRemaining.hours < 3) {
                        console.log("should emit the startTakingPredictions event");

                        ee.emit("startTakingPredictions", {timeRemaining: timeRemaining});

                    }
                }


                    config.bot.predictions.players = {};
                    config.bot.predictions.announcement = false;

                if(typeof cardMonitorInterval == 'number') {
                    clearInterval(cardMonitorInterval);
                }
            }
        },
        getStatusOfTrialsCard: function(apiData) {

            console.log("returned apiData is: ", apiData.Response.data.activities.trials.extended);
            //console.log("getStatusOfTrialsCard data: " + helpers.toString(apiData.Response.data));
            var trials = apiData.Response.data.activities.trials;
            if(!trials.status.active) {
                if(typeof cardMonitorInterval == 'number') {
                    clearInterval(cardMonitorInterval);
                }

            }
            config.bot.map = trials.display.flavor;
            
            if(trials.extended.scoreCard.hasTicket !== false) {
                if(!config.bot.card.boughtBoons) {
                    trials.extended.scoreCard.ticketItem.nodes.forEach(function(boon) {
                        if(!config.bot.card.boughtBoons && boon.isActivated) {
                            config.bot.card.boughtBoons = true;
                        }
                    });
                }
                console.log("reading latestCard: ", helpers.toString(config.bot.card.latestCard));
                if(trials.extended.scoreCard.wins > config.bot.card.latestCard.wins) {
                    config.bot.card.latestCard = trials.extended.scoreCard;
                    ee.emit("autoWin", {card: trials.extended.scoreCard});

                }
                else if(trials.extended.scoreCard.losses > config.bot.card.latestCard.losses) {
                    config.bot.card.latestCard = trials.extended.scoreCard;
                    ee.emit("autoLoss", {card: trials.extended.scoreCard});

                }
            }
        },
        buildGamertag: function(str){
            console.log("buildGamertag: ", str);
            var strArray = str.split(' ');
            var loops = strArray.length - 1; // minus 1 because the first one is the command that comes through
            var playerTag = '';
            for(var i=1; i <= loops; i++) {
                //console.log(cmd[i]);
                playerTag = playerTag + ' '+strArray[i];
            }
            console.log("buildGamertag, returning: ", playerTag);
            return playerTag;
        },
        /**
         * 
         * This function is honestly unnecessary when JSON.stringify exists. 
         *  
         */
        toString: function(obj) {
            var str = '{';
            for(var property in obj) {
                if(obj.hasOwnProperty(property)) {
                    str += "'"+property+"'" + ': '+obj[property]+', ';
                }
            }
            str += '}';
            return str;
        },
        isRequestPast10Mins: function(date1, date2) {
            return ((date2 - date1) > 600);
        },
        isRequestPastHour: function(date1, date2) {
            return ((date2 - date1) > 3600);
        },
        localToCentral: function() {
            var d = new Date();
            var localTime = d.getTime();
            var localOffset = d.getTimezoneOffset() * 60000;

            var utc = localTime + localOffset;
            var cOffset = -5;
            var central = utc + (3600000 * cOffset);
            var nd = new Date(central);

            return nd.toLocaleString();
        },
        getTimeRemaining: function(endtime){

            var t = (new Date(endtime).getTime() - new Date().getTime());

            var seconds = Math.floor( (t/1000) % 60 );
            var minutes = Math.floor( (t/1000/60) % 60 );
            var hours = Math.floor( (t/(1000*60*60)) % 24 );
            var days = Math.floor( t/(1000*60*60*24) );
            return {
                'total': t,
                'days': days,
                'hours': hours,
                'minutes': minutes,
                'seconds': seconds
            };
        },
        getRequestTimeRemaining: function(endtime, starttime){

            var t = (new Date(endtime).getTime() - new Date().getTime(starttime));

            var seconds = Math.floor( (t/1000) % 60 );
            var minutes = Math.floor( (t/1000/60) % 60 );
            var hours = Math.floor( (t/(1000*60*60)) % 24 );
            var days = Math.floor( t/(1000*60*60*24) );
            return {
                'total': t,
                'days': days,
                'hours': hours,
                'minutes': minutes,
                'seconds': seconds
            };
        },
        setGuardianMembershipAndCharacter: function(callback) {
            console.log("setting up guardian data, using: " + helpers.toString(config.bot.guardian));
            destiny.Search({
                membershipType: config.bot.guardian.membershipType, //membershipType,
                name: config.bot.guardian.id
            })
            .then(function (res) {
                if (res[0].membershipId) {
                    config.bot.guardian.membershipId = res[0].membershipId;
                    console.log("set guardian membershipId: " + config.bot.guardian.membershipId);
                    destiny.Account({
                        membershipType: config.bot.guardian.membershipType,
                        membershipId:   res[0].membershipId
                    })
                    .then(function (AccountRes) {
                        console.log("AccountRes: " + helpers.toString(AccountRes));
                        config.bot.guardian.characterId = AccountRes.characters[0].characterBase.characterId;
                        console.log("set guardian characterId: " + config.bot.guardian.characterId);
                        callback(config.bot.guardian);
                    });
                }
            });
        },
        getMembershipAndCharacterIdsByGamertag: function(gamertag, callback) {
            var id,
                charId,
                membershipType;
            console.log("getMembershipAndCharacterIdsByGamertag", gamertag);
            destiny.Search({
                membershipType: 1, //try xbox first
                name: gamertag
            })
            .then(function (res) {
                console.log("searched Xbox players: ", res);
                if(res[0]) {
                    membershipType = 1;
                    id = res[0].membershipId;
                    destiny.Account({
                        membershipType: res[0].membershipType,
                        membershipId: res[0].membershipId
                    })
                    .then(function(AccountRes) {
                        //console.log(AccountRes.characters[0].characterBase);
                        charId = AccountRes.characters[0].characterBase.characterId;
                        callback(id, charId, membershipType);
                    });
                }
                else {
                    destiny.Search({
                        membershipType: 2, //now try psn
                        name: gamertag
                    })
                    .then(function(res) {
                        console.log("searched PSN players: ", res);
                        if(res[0]) {
                            membershipType = 2;
                            id = res[0].membershipId;
                            destiny.Account({
                                membershipType: res[0].membershipType,
                                membershipId: res[0].membershipId
                            })
                            .then(function(AccountRes) {
                                //console.log(AccountRes.characters[0].characterBase);
                                charId = AccountRes.characters[0].characterBase.characterId;
                                callback(id, charId, membershipType);
                            });
                        }
                    });
                }
            });
        },
        verifyCommand: function(command, user) {
            var options = {
                host: 'tmi.twitch.tv',
                path: '/group/user/'+config.bot.streamer+'/chatters'
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
            else {
                var cmd = command.split(' ');
                return config.bot.commands.viewer.indexOf(cmd[0]) !== -1;
            }
        },
        setPlatformAndGuardianDetails: function() {
            var stream = fs.ReadStream('./bungiecookie.txt');

            var fileData = '';
            stream.on("data", function(data) {

                fileData += fileData;
            });
            stream.on("end", function() {
                console.log(fileData);
                var json = JSON.parse(fileData);
                if(json.platform === 'psn') {
                  //ideally, the gamertag information should have come from the XBL/PSN auth data so we don't have to re-declare it here
                    helpers.getMembershipAndCharacterIdsByGamertag('DrLupo-', function(gamertag, membershipId, characterId) {
                        config.bot.guardian.id = gamertag;
                        config.bot.guardian.membershipId = membershipId;
                        config.bot.guardian.characterId = characterId;
                    });
                }
                else {
                    helpers.getMembershipAndCharacterIdsByGamertag('DrLupo', function(gamertag, membershipId, characterId) {
                        config.bot.guardian.id = gamertag;
                        config.bot.guardian.membershipId = membershipId;
                        config.bot.guardian.characterId = characterId;
                    });
                }
                console.log("setPlatformAndGuardianDetails, ", config.bot.guardian);

            });
        },
        retrieveDestinyStats: function(user, action, gamertag, platform, channel) {
            action = (action) ? action : '';
            gamertag = (gamertag) ? gamertag : '';
            platform = (platform) ? platform : '';
            var gerhardUrl = 'https://2g.be/twitch/destinyv2.php?query='+action+'%20'+gamertag+'%20'+platform+'&user='+user+'&channel='+channel+'&bot=trialstrainbot&defaultconsole=xbox';
            console.log("gerhard URL: ", gerhardUrl);
            https.get(gerhardUrl, function (response) {
                var body = '';
                response.on('data', function (d) {
                    body += d;
                });
                response.on('end', function () {
                    console.log(body);
                    if(user === config.bot.streamer || user === 'nightbot') {
                        chat.say(channel, body);
                    }
                    else {
                        whisper.say(channel, '/w '+user+' ' +body);
                        
                    }

                });
            }).on('error', function(err) {
                console.log("err: " + err);
            });
        },
        retrieveDestinyStats2: function(user, query, channel) {

            var gerhardUrl = 'https://2g.be/twitch/destinyv2.php?query='+query+'&user='+user+'&channel='+channel+'&bot=trialstrainbot&defaultconsole=xbox';
            console.log("gerhard URL: ", gerhardUrl);
            https.get(gerhardUrl, function (response) {
                var body = '';
                response.on('data', function (d) {
                    body += d;
                });
                response.on('end', function () {
                    console.log(body);
                    if(user === 'drlupo' || user === 'nightbot') {
                        chat.say(channel, body);
                    }
                    else {
                        whisper.say(channel, '/w '+user+' ' +body);

                    }

                });
            }).on('error', function(err) {
                console.log("err: " + err);
            });
        },
        writeLatestCardFile: function(card) {
            console.log("received writeLatestCardFile, data: ", card);
            fs.writeFile('./latestcard.txt', '"'+card+'"', function(err) {
                console.log(err);
            });
        },
        blankLatestCardFile: function() {
            fs.writeFile('./latestcard.txt', '1', function(err) {
                console.log(err);
            });
        },
        getListOfPredictionWinners: function(map) {
            var cleanedMap = map.replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
            var winnerList = '';
            Object.keys(config.bot.predictions.players).forEach(function(player, idx) {
                var playerMap = config.bot.predictions.players[player].replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
                if(playerMap == cleanedMap) {
                    console.log("winner added to list: " + player + ", map: " + playerMap);
                    winnerList =+ '@'+player+', ';
                }
            });
            if(winnerList.length > 0) {
                return 'These viewers win a cookie for correctly predicting the map: (＾◡＾)っ🍪 ' + winnerList;
            }
            else {
                return 'No one correctly predicted the map. 😭';
            }
        }
    };

    function issueCommand(command, channel, user) {
        console.log("issueCommand args: " + helpers.toString(arguments));
        var cmd = command.split(' ');
        var action = cmd[0];
        ee.emit("bot-"+action+"Request", {cmd: command, channel: channel, user: user, action: action});
    }

    function watchBungieCookie() {
        console.log("watchBungieCookie fn called");
        var watchHash;

        chokidar.watch(config.bot.cookie.path, {}).on("all", function(event, path, stats) {
            if(event == 'change') {
                getFileHash(config.bot.cookie.path, function(hash, fileData) {
                    if(hash != watchHash) {
                        watchHash = hash;
                        ee.emit("bot-cookieFileRead", {fileData: fileData});
                    }
                });
            }
        });
    }

    function getFileHash(filePath, callback) {
        var stream = fs.ReadStream(filePath);
        var md5sum = crypto.createHash("md5");
        var fileData = '';
        stream.on("data", function(data) {
            md5sum.update(data);
            fileData += fileData;
        });
        stream.on("end", function() {
            callback(md5sum.digest("hex"), fileData);
        });
    }

    function setBungieCookie() {
        var stream = fs.ReadStream(config.bot.cookie.path);
        var fileData = '';
        stream.on("data", function(data) {
            fileData += data;
        });
        stream.on("end", function() {
            if(fileData === '1') {
                return;
            }

            var jsonCookie = JSON.parse(fileData);
            if(!jsonCookie.bungleatk) {
                return;
            }

            config.bot.cookie.changed = !config.bot.cookie.changed;
            config.bot.cookie.bungleatk = jsonCookie.bungleatk;
            config.bot.cookie.bungled = jsonCookie.bungled;
            config.bot.cookie.bungledid = jsonCookie.bungledid;
            config.bot.cookie.bunglemsa = jsonCookie.bunglemsa;
            config.bot.cookie.bungleme = jsonCookie.bungleme;
            config.bot.cookie.bunglefrogblastventcore = jsonCookie.bunglefrogblastventcore;
            config.bot.cookie.platform = jsonCookie.method;
            
            if(jsonCookie.method === 'psn') {
                config.bot.guardian.membershipType = 2;
                config.bot.guardian.id = 'DrLupo-';
            }
            console.log("bungieCookie set: " + helpers.toString(config.bot.cookie, config.bot.guardian));
        });
    }

    function scout(gamertag, membershipType, membershipId, characterId, user, callback) {
        console.log("scout: ", membershipType, membershipId, characterId);
        var body, parsed,
            activities, revActivities,
            kills = 0, recentActivity,
            deaths = 0, wins = 0, losses = 0,
            killDeath, winPct, scoutMsg,
            winStreak = 0, loseStreak = 0;

        var trialsReqOptions = {
            host: 'www.bungie.net',
            path: '/Platform/Destiny/Stats/ActivityHistory/'+membershipType+'/'+membershipId+'/'+characterId+'/?mode=14&count=25',
            headers: {"X-API-Key":config.destiny.apiKey}
        };
        console.log(helpers.toString(trialsReqOptions));
        https.get(trialsReqOptions, function(response) {
            body = '';
            response.on('data', function(d) {
                body += d;
            });
            response.on('end', function() {
                parsed = JSON.parse(body);
                console.log(parsed);
                if(typeof parsed.Response.data.activities === 'undefined') {
                    scoutMsg = '/me @'+user+', gamer '+gamertag+' has not played Trials on their recent character.';
                    callback(scoutMsg);
                } else {
                    activities = parsed.Response.data.activities;
                    revActivities = activities.slice().reverse();
                    var recentActivity = revActivities[0];

                    for(var j = 0; j < revActivities.length; j++) {

                        kills += parseInt(activities[j].values.kills.basic.displayValue);
                        deaths += parseInt(activities[j].values.deaths.basic.displayValue);
                        if(revActivities[j].values.standing.basic.displayValue === 'Victory') {
                            wins++;
                        }
                        if(revActivities[j].values.standing.basic.displayValue === 'Defeat') {
                            losses++;
                        }

                        winStreak = ((revActivities[j].values.standing.basic.displayValue === 'Victory') && revActivities[j].values.standing.basic.value === recentActivity.values.standing.basic.value) ? winStreak+1 : winStreak = 0;

                    }

                    console.log("last activity stats: " + kills + " kills // " + deaths + " deaths // " + wins + " wins // " + losses + " losses");
                    killDeath = kills / deaths;
                    winPct = Math.floor(((wins / revActivities.length) === 1) ? 100 : (wins / revActivities.length * 100));

                    scoutMsg = '/me @'+user+', stats for the last 25 games for: ' + gamertag + ' are: '+ kills + " kills // " + deaths + " deaths // " + wins + " wins // " + losses + " losses. KDR: " + killDeath.toFixed(2) + " // Win %: " + winPct + ' // Win Streak: ' + winStreak + '';
                    callback(scoutMsg);


                }

            });
        }).on('error', function(e) {
            callback("err: " + e);
        });
    }

    function virginity(membershipId, membershipType, gamertag, user, callback) {
        var body = '';
        gamertag = gamertag.trim();
        console.log("virginity called: ", arguments, gamertag);
        var reqOptions = {
            host: 'www.bungie.net',
            path: "/Platform/Destiny/Vanguard/Grimoire/"+membershipType+"/" + membershipId + "/?single=401030",
            headers: {"X-API-Key":config.destiny.apiKey}
        };
        http.get(reqOptions,
            function(response) {

                response.on('data', function(d) {
                    body += d;
                });
                response.on('end', function() {
                    var parsed = JSON.parse(body);
                    //console.log(parsed);
                    if(!parsed.Response.data.cardCollection[0]) {
                        callback('/me @'+user+' , '+ gamertag+' is a Lighthouse Virgin!');
                    }
                    else {
                        callback('/me @'+user+' , '+gamertag+' is a Lighthouse Veteran!');
                    }

                });
            }).on('error', function(e) {
            //console.log("143: " + e);
        });
    }
}

var ttb = new TrialsOfOsirisBot(botConfig);
ttb.init();

