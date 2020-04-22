//Variable initialization
var ChatLive_loadingDataTryMax = 10;
var Chat_Id = [];
var ChatLive_loadBadgesChannelId;
var ChatLive_socket = [];
var ChatLive_loaded = [];
var ChatLive_CheckId = [];
var ChatLive_JoinID = [];
var ChatLive_LineAddCounter = [];
var ChatLive_Messages = [];
var ChatLive_Banned = [];
var ChatLive_FollowState = [];
var ChatLive_SubState = [];
var ChatLive_Playing = true;
var extraEmotesDone = {
    bbtv: {},
    ffz: {},
    cheers: {},
    BadgesChannel: {}
};

var userEmote = {};
var extraEmotes = {};
var cheers = {};

var ChatLive_selectedChannel_id = [];
var ChatLive_selectedChannel = [];

var emoteReplace = {
    "B-?\\)": "B)",
    "\\:-?\\)": ":)",
    "\\:-?\\(": ":(",
    "\\:-?(p|P)": ":P",
    "\\;-?(p|P)": ";P",
    "\\:-?[\\\\/]": ":/",
    "\\;-?\\)": ";)",
    "R-?\\)": "R)",
    ":>": ":>",
    "\\:\\&gt\\;": ":>",
    "[oO](_|\\.)[oO]": "O_O",
    "\\:-?D": ":D",
    "\\:-?(o|O)": ":O",
    ">\\\\(": ">(",
    ":-?(?:7|L)": ":7",
    "\\:-?(S|s)": ":s",
    "#-?[\\\\/]": "#/",
    "<\\]": "<]",
    "<3": "<3",
    "\\&lt\\;3": "<3",
    "\\&lt\\;\\]": "<]",
    "\\&gt\\;\\(": ">(",
    "\\:-?[z|Z|\\|]": ":Z",
};

//Variable initialization end

function ChatLive_Init(chat_number) {
    ChatLive_Clear(chat_number);
    if (Main_values.Play_ChatForceDisable) {
        Chat_Disable();
        return;
    }

    Chat_loadBadgesGlobal();

    Chat_Id[chat_number] = (new Date()).getTime();
    ChatLive_selectedChannel_id[chat_number] = !chat_number ? Play_data.data[14] : PlayExtra_data.data[14];
    ChatLive_selectedChannel[chat_number] = !chat_number ? Play_data.data[6] : PlayExtra_data.data[6];

    ChatLive_loadEmotesUser(0);
    ChatLive_checkFallow(0, chat_number, Chat_Id[chat_number]);
    ChatLive_checkSub(0, chat_number, Chat_Id[chat_number]);

    ChatLive_loadEmotesChannelbbtv(0, chat_number, Chat_Id[chat_number]);
    ChatLive_loadEmotesChannelffz(0, chat_number, Chat_Id[chat_number]);

    ChatLive_loadBadgesChannel(0, chat_number, Chat_Id[chat_number]);
    ChatLive_loadCheersChannel(0, chat_number, Chat_Id[chat_number]);

    ChatLive_loadChat(chat_number, Chat_Id[chat_number]);
}

function ChatLive_checkFallow(tryes, chat_number, id) {
    if (!AddUser_IsUserSet() || !AddUser_UsernameArray[0].access_token || id !== Chat_Id[chat_number]) return;

    ChatLive_FollowState[chat_number] = {};

    var xmlHttp = new XMLHttpRequest();
    var theUrl = Main_kraken_api + 'users/' + AddUser_UsernameArray[0].id + '/follows/channels/' + ChatLive_selectedChannel_id[chat_number] + Main_TwithcV5Flag_I;

    xmlHttp.open("GET", theUrl, true);

    for (var i = 0; i < 2; i++)
        xmlHttp.setRequestHeader(Main_Headers[i][0], Main_Headers[i][1]);

    xmlHttp.timeout = 10000;
    xmlHttp.ontimeout = function() {};

    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState === 4) {
            if (xmlHttp.status === 200) { //yes
                ChatLive_checkFallowSuccess(xmlHttp.responseText, chat_number, id);
            } else if (xmlHttp.status === 404) { //no
                ChatLive_RequestCheckFollowNOK(xmlHttp.responseText, tryes, chat_number, id);
            } else { // internet error
                ChatLive_checkFallowError(tryes, chat_number, id);
            }
        }
    };

    xmlHttp.send(null);
}

function ChatLive_checkFallowSuccess(responseText, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;
    ChatLive_checkFallowSuccessUpdate(responseText, chat_number);
}

function ChatLive_checkFallowSuccessUpdate(responseText, chat_number) {
    responseText = JSON.parse(responseText);

    ChatLive_FollowState[chat_number] = {
        created_at: responseText.created_at,
        follows: true
    };
}

function ChatLive_GetMinutes(time) {// "2020-04-17T21:03:42Z"
    time = (new Date().getTime()) - (new Date(time).getTime());
    return Math.floor(Math.floor(parseInt(time / 1000)) / 60);
}

function ChatLive_RequestCheckFollowNOK(response, tryes, chat_number, id) {
    response = JSON.parse(response);

    if (response.message && Main_A_includes_B((response.message + ''), 'Follow not found')) {
        ChatLive_FollowState[chat_number].follows = false;
    } else ChatLive_checkFallowError(tryes, chat_number, id);
}

function ChatLive_checkFallowError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_checkFallow(tryes + 1, chat_number, id);
}

function ChatLive_checkSub(tryes, chat_number, id) {
    if (!AddUser_IsUserSet() || !AddUser_UsernameArray[0].access_token || id !== Chat_Id[chat_number]) return;

    ChatLive_SubState[chat_number] = {};

    var xmlHttp = new XMLHttpRequest();
    var theUrl = Main_kraken_api + 'users/' + AddUser_UsernameArray[0].id + '/subscriptions/' + ChatLive_selectedChannel_id[chat_number] + Main_TwithcV5Flag_I;

    xmlHttp.open("GET", theUrl, true);

    Main_Headers[2][1] = Main_OAuth + AddUser_UsernameArray[0].access_token;
    for (var i = 0; i < 3; i++)
        xmlHttp.setRequestHeader(Main_Headers[i][0], Main_Headers[i][1]);

    xmlHttp.timeout = 10000;
    xmlHttp.ontimeout = function() {};

    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState === 4) {
            if (xmlHttp.status === 200) { //yes
                ChatLive_SubState[chat_number].state = true;
            } else if (xmlHttp.status === 404) {
                var response = JSON.parse(xmlHttp.responseText);
                if (response.message && Main_A_includes_B((response.message + ''), 'has no subscriptions')) {//no
                    ChatLive_SubState[chat_number].state = false;
                } else ChatLive_checkSubError(tryes, chat_number, id);
            } else { // internet error
                ChatLive_checkSubError(tryes, chat_number, id);
            }
        }
    };

    xmlHttp.send(null);
}

function ChatLive_checkSubError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_checkSub(tryes + 1, chat_number, id);
}

function ChatLive_loadBadgesChannel(tryes, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    if (!extraEmotesDone.BadgesChannel[ChatLive_selectedChannel_id[chat_number]]) {
        ChatLive_BaseLoadUrl(
            id,
            'https://badges.twitch.tv/v1/badges/channels/' + ChatLive_selectedChannel_id[chat_number] + '/display',
            chat_number,
            tryes,
            ChatLive_loadBadgesChannelSuccess,
            ChatLive_loadBadgesChannelError
        );

    } else {
        Chat_loadBadgesTransform(extraEmotesDone.BadgesChannel[ChatLive_selectedChannel_id[chat_number]], chat_number, Chat_div[chat_number]);
    }
}

function ChatLive_loadBadgesChannelSuccess(responseText, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    extraEmotesDone.BadgesChannel[ChatLive_selectedChannel_id[chat_number]] = JSON.parse(responseText);
    Chat_loadBadgesTransform(extraEmotesDone.BadgesChannel[ChatLive_selectedChannel_id[chat_number]], chat_number, Chat_div[chat_number]);
}

function ChatLive_loadBadgesChannelError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_loadBadgesChannel(tryes + 1, chat_number, id);
}

function ChatLive_loadEmotesUser(tryes) {
    if (AddUser_IsUserSet() && AddUser_UsernameArray[0].access_token) {
        ChatLive_BaseLoadUrl(
            0,
            Main_kraken_api + 'users/' + AddUser_UsernameArray[0].id + '/emotes',
            0,
            tryes,
            ChatLive_loadEmotesUserSuccess,
            ChatLive_loadEmotesUserError,
            Main_Headers,
            3
        );
    }
}

function ChatLive_loadEmotesUserError(tryes) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_loadEmotesUser(tryes + 1);
}

function ChatLive_loadEmotesUserSuccess(data) {
    try {

        data = JSON.parse(data);
        if (!userEmote.hasOwnProperty(AddUser_UsernameArray[0].id)) userEmote[AddUser_UsernameArray[0].id] = {};

        var url;

        Object.keys(data.emoticon_sets).forEach(function(set) {
            set = data.emoticon_sets[set];
            if (Array.isArray(set)) {

                set.forEach(function(emoticon) {

                    if (!emoticon.code || !emoticon.id) return;
                    if (typeof emoticon.code !== 'string' || typeof emoticon.id !== 'number') return;

                    emoticon.code = emoteReplace[emoticon.code] || emoticon.code;

                    if (userEmote[AddUser_UsernameArray[0].id].hasOwnProperty(emoticon.code)) return;

                    url = emoteURL(emoticon.id);

                    extraEmotes[emoticon.code] = {
                        code: emoticon.code,
                        id: emoticon.id,
                        '4x': url
                    };

                    userEmote[AddUser_UsernameArray[0].id][emoticon.code] = {
                        code: emoticon.code,
                        id: emoticon.id,
                        '4x': url,
                        div: ChatLiveControls_SetEmoteDiv(extraEmotes[emoticon.code])
                    };

                });
            }
        });

    } catch (e) {}
}

function ChatLive_loadEmotesChannelbbtv(tryes, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    if (!extraEmotesDone.bbtv[ChatLive_selectedChannel_id[chat_number]]) {
        ChatLive_BaseLoadUrl(
            id,
            'https://api.betterttv.net/2/channels/' + encodeURIComponent(ChatLive_selectedChannel[chat_number]),
            chat_number,
            tryes,
            ChatLive_loadEmotesChannelbbtvSuccess,
            ChatLive_loadEmotesChannelError
        );
    } else {
        ChatLive_updateExtraEmotes(extraEmotesDone.bbtv[ChatLive_selectedChannel_id[chat_number]]);
    }
}

function ChatLive_loadEmotesChannelError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_loadEmotesChannelbbtv(tryes + 1, chat_number, id);
}

function ChatLive_loadEmotesChannelbbtvSuccess(data, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    ChatLive_loadEmotesbbtv(JSON.parse(data), chat_number, false);
}

function ChatLive_loadEmotesbbtv(data, chat_number, skipChannel) {
    if (!skipChannel) extraEmotesDone.bbtv[ChatLive_selectedChannel_id[chat_number]] = {};
    else extraEmotesDone.bbtvGlobal = {};

    var url, Div;

    data.emotes.forEach(function(emote) {
        if (data.urlTemplate) {

            url = 'https:' + data.urlTemplate.replace('{{id}}', emote.id).replace('{{image}}', '3x');

            extraEmotes[emote.code] = {
                code: emote.code,
                id: emote.id,
                '4x': url
            };

            Div = ChatLiveControls_SetEmoteDiv(extraEmotes[emote.code]);

            //Don't copy to prevent shallow clone
            if (!skipChannel) {
                extraEmotesDone.bbtv[ChatLive_selectedChannel_id[chat_number]][emote.code] = {
                    code: emote.code,
                    id: emote.id,
                    '4x': url,
                    div: Div
                };
            } else {
                extraEmotesDone.bbtvGlobal[emote.code] = {
                    code: emote.code,
                    id: emote.id,
                    '4x': url,
                    div: Div
                };
            }
        }
    });

}

function ChatLive_loadCheersChannel(tryes, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    if (!extraEmotesDone.cheers[ChatLive_selectedChannel_id[chat_number]]) {

        ChatLive_BaseLoadUrl(
            id,
            'https://api.twitch.tv/v5/bits/actions?channel_id=' + encodeURIComponent(ChatLive_selectedChannel_id[chat_number]),
            chat_number,
            tryes,
            ChatLive_loadCheersChannelSuccess,
            ChatLive_loadCheersChannelError,
            Main_Headers,
            1
        );
    }
}

function ChatLive_loadCheersChannelError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_loadCheersChannel(tryes + 1, chat_number, id);
}

function ChatLive_loadCheersChannelSuccess(data, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    cheers[ChatLive_selectedChannel_id[chat_number]] = {};
    data = JSON.parse(data);

    try {
        data.actions.forEach(
            function(action) {

                cheers[ChatLive_selectedChannel_id[chat_number]][action.prefix] = {};

                action.tiers.forEach(
                    function(tier) {
                        cheers[ChatLive_selectedChannel_id[chat_number]][action.prefix][tier.min_bits] = tier.images.light.animated['4'];
                    }
                );
            }
        );

        extraEmotesDone.cheers[ChatLive_selectedChannel_id[chat_number]] = 1;
    } catch (e) {}

}

function ChatLive_updateExtraEmotes(obj) {
    //We need to update the main obj as some channel have the same code for different emotes image
    for (var property in obj) {
        extraEmotes[property] = {
            code: obj[property].code,
            id: obj[property].id,
            '4x': obj[property]['4x']
        };
    }
}

function ChatLive_loadEmotesChannelffz(tryes, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    if (!extraEmotesDone.ffz[ChatLive_selectedChannel_id[chat_number]]) {
        ChatLive_BaseLoadUrl(
            id,
            'https://api.frankerfacez.com/v1/room/' + encodeURIComponent(ChatLive_selectedChannel[chat_number]),
            chat_number,
            tryes,
            ChatLive_loadEmotesChannelffzSuccess,
            ChatLive_loadEmotesChannelffzError
        );
    } else {
        ChatLive_updateExtraEmotes(extraEmotesDone.ffz[ChatLive_selectedChannel_id[chat_number]]);
    }
}

function ChatLive_loadEmotesChannelffzError(tryes, chat_number, id) {
    if (tryes < ChatLive_loadingDataTryMax) ChatLive_loadEmotesChannelffz(tryes + 1, chat_number, id);
}

function ChatLive_loadEmotesChannelffzSuccess(data, chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    ChatLive_loadEmotesffz(JSON.parse(data), chat_number, false);
}

function ChatLive_loadEmotesffz(data, chat_number, skipChannel) {
    if (!skipChannel) extraEmotesDone.ffz[ChatLive_selectedChannel_id[chat_number]] = {};
    else extraEmotesDone.ffzGlobal = {};

    var url, Div;

    Object.keys(data.sets).forEach(function(set) {
        set = data.sets[set];
        if (set.emoticons || Array.isArray(set.emoticons)) {

            set.emoticons.forEach(function(emoticon) {

                if (!emoticon.name || !emoticon.id) return;
                if (typeof emoticon.name !== 'string' || typeof emoticon.id !== 'number') return;

                if (!emoticon.urls || typeof emoticon.urls !== 'object') return;

                if (typeof emoticon.urls[1] !== 'string') return;
                if (emoticon.urls[2] && typeof emoticon.urls[2] !== 'string') return;

                url = 'https:' + (emoticon.urls[4] || emoticon.urls[2] || emoticon.urls[1]);

                extraEmotes[emoticon.name] = {
                    code: emoticon.name,
                    id: emoticon.id,
                    '4x': url
                };

                Div = ChatLiveControls_SetEmoteDiv(extraEmotes[emoticon.name]);

                //Don't copy to prevent shallow clone
                if (!skipChannel) {
                    extraEmotesDone.ffz[ChatLive_selectedChannel_id[chat_number]][emoticon.name] = {
                        code: emoticon.name,
                        id: emoticon.id,
                        '4x': url,
                        div: Div
                    };
                } else {
                    extraEmotesDone.ffzGlobal[emoticon.name] = {
                        code: emoticon.name,
                        id: emoticon.id,
                        '4x': url,
                        div: Div
                    };
                }

            });
        }
    });
}

var useToken = [];

function ChatLive_loadChat(chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    ChatLive_CheckClear(chat_number);
    ChatLive_LineAdd('<span class="message">' + STR_LOADING_CHAT + STR_SPACE + STR_LIVE + STR_SPACE + STR_CHANNEL + ': ' +
        (!chat_number ? Play_data.data[1] : PlayExtra_data.data[1]) + '</span>', chat_number);
    ChatLive_loadChatRequest(chat_number, id);

    useToken[chat_number] = !ChatLive_Banned[chat_number] && AddUser_IsUserSet() && AddUser_UsernameArray[0].access_token;

    if (!chat_number) {
        if (useToken[chat_number]) ChatLive_SendPrepared();
        else if (!AddUser_IsUserSet() || !AddUser_UsernameArray[0].access_token) ChatLive_SendClose();
    }

}

function ChatLive_loadChatRequest(chat_number, id) {
    if (id !== Chat_Id[chat_number]) return;

    ChatLive_socket[chat_number] = new ReconnectingWebSocket('wss://irc-ws.chat.twitch.tv:443', 'irc', {
        reconnectInterval: 3000
    });

    if (!ChatLive_Banned[chat_number] && AddUser_IsUserSet() && AddUser_UsernameArray[0].access_token) {
        ChatLive_socket[chat_number].onopen = function() {
            ChatLive_socket[chat_number].send('PASS oauth:' + AddUser_UsernameArray[0].access_token + '\r\n');
            ChatLive_socket[chat_number].send('NICK ' + AddUser_UsernameArray[0].name.toLowerCase() + '\r\n');
        };
    } else {
        ChatLive_socket[chat_number].onopen = function() {
            ChatLive_socket[chat_number].send('PASS blah\r\n');
            ChatLive_socket[chat_number].send('NICK justinfan12345\r\n');
            ChatLive_socket[chat_number].send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
            ChatLive_socket[chat_number].send('JOIN #' + ChatLive_selectedChannel[chat_number] + '\r\n');
        };
    }

    ChatLive_socket[chat_number].onmessage = function(data) {

        var message = window.parseIRC(data.data.trim());

        if (!message.command) return;

        //Main_Log(message);
        //Main_Log(message.command);

        switch (message.command) {
            case "PING":
                Main_Log('ChatLive_socket[chat_number] ' + chat_number + ' PING');
                Main_Log(message);
                ChatLive_socket[chat_number].send('PONG ' + message.params[0]);
                break;
            case "001":
                if (useToken[chat_number]) {
                    if (Main_A_includes_B(message.params[1], AddUser_UsernameArray[0].name.toLowerCase())) {
                        ChatLive_SetCheck(chat_number, id);
                        ChatLive_socket[chat_number].send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
                    }
                }
                break;
            case "CAP":
                if (useToken[chat_number]) {
                    //Delay the joing so the cap get fully accepted
                    window.clearTimeout(ChatLive_JoinID[chat_number]);
                    ChatLive_JoinID[chat_number] = window.setTimeout(function() {
                        ChatLive_socket[chat_number].send('JOIN #' + ChatLive_selectedChannel[chat_number] + '\r\n');
                    }, 500);
                }
                break;
            case "JOIN":

                if (!ChatLive_loaded[chat_number]) {
                    ChatLive_loaded[chat_number] = true;
                    ChatLive_LineAdd('<span class="message">' + STR_CHAT_CONNECTED + " as " +
                        (useToken[chat_number] ? AddUser_UsernameArray[0].display_name : STR_GIFT_ANONYMOUS) + '</span>', chat_number);

                    if (Play_ChatDelayPosition) {
                        var stringSec = STR_SECOND;
                        if (Play_controls[Play_controlsChatDelay].defaultValue > 1) stringSec = STR_SECONDS;

                        ChatLive_LineAdd('<span class="message">' + STR_CHAT_DELAY + ' ' +
                            Play_controls[Play_controlsChatDelay].values[Play_controls[Play_controlsChatDelay].defaultValue] +
                            stringSec + '</span>', chat_number);
                    }

                }

                if (useToken[chat_number]) {
                    //1: "tmi.twitch.tv USERSTATE #cyr↵@emote-only=0;followers-only=-1;r9k=0;rituals=0;room-id=37522866;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #cyr"
                    if (message.params[1] && Main_A_includes_B(message.params[1], "ROOMSTATE")) {

                        var Regex = /emote-only=(\d+).*followers-only=(-1|\d+).*r9k=(\d+).*slow=(\d+).*subs-only=(\d+).*/g;
                        var array = Regex.exec(message.params[1]);
                        if (array && array.length === 6) ChatLive_SetRoomState(array, chat_number);

                    } else {
                        //try a join again so the ROOMSTATE get send
                        window.clearTimeout(ChatLive_JoinID[chat_number]);
                        ChatLive_JoinID[chat_number] = window.setTimeout(function() {
                            ChatLive_socket[chat_number].send('JOIN #' + ChatLive_selectedChannel[chat_number] + '\r\n');
                        }, 500);
                    }
                }

                break;
            case "PRIVMSG":
                //Main_Log(message);
                ChatLive_loadChatSuccess(message, chat_number);
                break;
            case "USERNOTICE":
                if (useToken[chat_number]) ChatLive_CheckGiftSub(message, chat_number);
                break;
            case "USERSTATE":
                Main_Log('USERSTATE chat ' + chat_number);
                Main_Log(message);
                // tags:
                // badge-info: true
                // badges: true
                // color: true
                // display-name: "testtwitch27"
                // emote-sets: "0"
                // mod: "0"
                // subscriber: "0"
                // user-type: true
                break;
            case "NOTICE":
                if (useToken[chat_number]) {
                    ChatLive_UserNoticeCheck(message, chat_number, id);
                }
                // command: "NOTICE"
                // params: Array(2)
                // 0: "#channel"
                // 1: "You are permanently banned from talking in buddha."
                // length: 2
                // __proto__: Array(0)
                // prefix: "tmi.twitch.tv"
                // raw: "@msg-id=msg_banned :tmi.twitch.tv NOTICE #channel :You are permanently banned from talking in channel."
                // tags:
                // msg-id: "msg_banned"
                break;
            case "ROOMSTATE":
                ChatLive_UpdateRoomState(message, chat_number);
                // command: "ROOMSTATE"
                // params: Array(6)
                // 0: "#sayeedblack
                // ↵:testtwitch27.tmi.twitch.tv"
                // 1: "353"
                // 2: "testtwitch27"
                // 3: "="
                // 4: "#sayeedblack"
                // 5: "testtwitch27
                // ↵:testtwitch27.tmi.twitch.tv 366 testtwitch27 #sayeedblack :End of /NAMES list"
                // length: 6
                // __proto__: Array(0)
                // prefix: "tmi.twitch.tv"
                // raw: "@emote-only=0;followers-only=-1;r9k=0;rituals=1;room-id=83084666;slow=0;subs-only=0 :tmi.twitch.tv ROOMSTATE #sayeedblack
                // ↵:testtwitch27.tmi.twitch.tv 353 testtwitch27 = #sayeedblack :testtwitch27
                // ↵:testtwitch27.tmi.twitch.tv 366 testtwitch27 #sayeedblack :End of /NAMES list"
                // tags:
                // emote-only: "0"
                // followers-only: "-1"
                // r9k: "0"
                // rituals: "1"
                // room-id: "83084666"
                // slow: "0"
                // subs-only: "0"
                // __proto__: Object
                // __proto__: Object
                break;
            case "PART":
                if (ChatLive_socket[chat_number]) ChatLive_socket[chat_number].close(1000);
                break;
            default:
                break;
        }
    };

    ChatLive_SetCheck(chat_number, id);
}

function ChatLive_SetCheck(chat_number, id) {
    window.clearTimeout(ChatLive_CheckId[chat_number]);
    if (!ChatLive_loaded[chat_number] && id === Chat_Id[chat_number]) {
        ChatLive_CheckId[chat_number] = window.setTimeout(function() {
            ChatLive_Check(chat_number, id);
        }, 5000);
    }
}

function ChatLive_Check(chat_number, id) {
    if (!ChatLive_loaded[chat_number] && id === Chat_Id[chat_number]) {
        ChatLive_socket[chat_number].close(1000);
        ChatLive_LineAdd('<span class="message">' + STR_LOADING_FAIL + '</span>', chat_number);
        ChatLive_loadChat(chat_number, id);
    }
}

function ChatLive_CheckClear(chat_number) {
    window.clearTimeout(ChatLive_JoinID[chat_number]);
    window.clearTimeout(ChatLive_CheckId[chat_number]);
}

var ChatLive_RoomState = [];
function ChatLive_SetRoomState(array, chat_number) {
    Main_Log('ChatLive_SetRoomState');

    ChatLive_RoomState[chat_number] = {
        'emote-only': parseInt(array[1]),
        'followers-only': parseInt(array[2]),
        rk9: parseInt(array[3]),
        slow: parseInt(array[4]),
        'subs-only': parseInt(array[5])
    };

    Main_Log(ChatLive_RoomState[chat_number]);
    ChatLiveControls_RefreshRoomState(chat_number);
}

function ChatLive_UpdateRoomState(message, chat_number) {
    Main_Log('ChatLive_UpdateRoomState');
    Main_Log(message);
    if (message.tags) {

        if (!ChatLive_RoomState[chat_number]) ChatLive_RoomState[chat_number] = {};

        var tags = message.tags;

        if (tags.hasOwnProperty('emote-only')) ChatLive_RoomState[chat_number]['emote-only'] = parseInt(tags['emote-only']);
        if (tags.hasOwnProperty('followers-only')) ChatLive_RoomState[chat_number]['followers-only'] = parseInt(tags['followers-only']);
        if (tags.hasOwnProperty('rk9')) ChatLive_RoomState[chat_number].rk9 = parseInt(tags.rk9);
        if (tags.hasOwnProperty('slow')) ChatLive_RoomState[chat_number].slow = parseInt(tags.slow);
        if (tags.hasOwnProperty('subs-only')) ChatLive_RoomState[chat_number]['subs-only'] = parseInt(tags['subs-only']);

        Main_Log(ChatLive_RoomState[chat_number]);
        ChatLiveControls_RefreshRoomState(chat_number);
    }
}

var ChatLive_socketSend;
var ChatLive_socketSendJoin = false;
var ChatLive_socketSendCheckID;
function ChatLive_SendPrepared() {
    if (!ChatLive_socketSend || ChatLive_socketSend.readyState !== 1) {
        ChatLive_SendClose();

        ChatLive_socketSend = new ReconnectingWebSocket('wss://irc-ws.chat.twitch.tv:443', 'irc', {
            reconnectInterval: 3000
        });

        ChatLive_socketSend.onopen = function() {
            ChatLive_socketSend.send('PASS oauth:' + AddUser_UsernameArray[0].access_token + '\r\n');
            ChatLive_socketSend.send('NICK ' + AddUser_UsernameArray[0].name.toLowerCase() + '\r\n');
        };

        ChatLive_socketSend.onmessage = function(data) {

            var message = window.parseIRC(data.data.trim());

            if (!message.command) return;

            //Main_Log(message.command);
            //Main_Log(message);

            switch (message.command) {
                case "PING":
                    Main_Log('ChatLive_socketSend PING');
                    Main_Log(message);
                    ChatLive_socketSend.send('PONG ' + message.params[0]);
                    break;
                case "001":
                    if (message.params[1]) {
                        if (Main_A_includes_B(message.params[1], AddUser_UsernameArray[0].name.toLowerCase())) {
                            ChatLive_socketSendSetCheck();
                            ChatLive_socketSend.send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
                        }
                    }
                    break;
                case "CAP":
                    ChatLive_socketSendJoin = true;
                    break;
                case "NOTICE":
                    ChatLive_UserNoticeWarn(message);
                    break;
                case "USERSTATE":
                    Main_Log('USERSTATE send');
                    Main_Log(message);
                    break;
                default:
                    break;
            }
        };
    }

    ChatLive_socketSendSetCheck();
}

function ChatLive_SendClose() {
    if (ChatLive_socketSend) {
        ChatLive_socketSend.close(1000);
    }
    ChatLive_socketSendJoin = false;
}

function ChatLive_socketSendSetCheck() {
    window.clearTimeout(ChatLive_socketSendCheckID);
    ChatLive_socketSendCheckID = window.setTimeout(function() {
        ChatLive_socketSendCheck();
    }, 5000);
}

function ChatLive_socketSendCheck() {
    if (!ChatLive_socketSendJoin) {
        ChatLive_socketSend.close(1000);
        ChatLive_SendPrepared();
    }
}

function ChatLive_UserNoticeCheck(message, chat_number, id) {
    Main_Log(message);

    if (message.tags && message.tags.hasOwnProperty('msg-id') && Main_A_includes_B(message.tags['msg-id'] + '', "msg_banned")) {

        var text = message.params && message.params[1] ? message.params[1] : STR_CHAT_BANNED + ChatLive_selectedChannel[chat_number];
        ChatLive_Warn(text, 5000);

        ChatLive_Banned[chat_number] = true;

        window.clearTimeout(ChatLive_CheckId[chat_number]);
        ChatLive_Check(chat_number, id);
    } else ChatLive_UserNoticeWarn(message);

}

function ChatLive_UserNoticeWarn(message) {
    Main_Log(message);

    if (message.params[1] && !Main_A_includes_B(message.params[1], "NICK already set")) {

        Main_Log(message.params[1]);
        ChatLive_Warn(message.params[1], 5000);

    }
}

function ChatLive_Warn(message, time) {
    ChatLiveControls_showWarningDialog('Chat: ' + message, time);
    Play_showWarningMidleDialog('Chat: ' + message, time);
}

function ChatLive_SendMessage(message, chat_number) {
    Main_Log('ChatLive_SendMessage ' + ChatLive_socketSendJoin + ' msg ' + message);

    if (ChatLive_socketSendJoin && ChatLive_socketSend && ChatLive_socketSend.readyState === 1) {
        Main_Log('ChatLive_SendMessage sended');
        ChatLive_socketSend.send('PRIVMSG #' + ChatLive_selectedChannel[chat_number] + ' :' + message + '\r\n');

        return true;
    }

    return false;
}

// function ChatLive_FakeSendMessage(messageText, chat_number) {
//     Main_Log('ChatLive_FakeSendMessage ' + messageText);

//     var message = {
//         params: [
//             "",
//             messageText
//         ],
//         tags: {
//             "badge-info": true,
//             badges: true,
//             color: true,
//             "display-name": "testtwitch27",
//             "emote-sets": "0",
//             mod: "0",
//             subscriber: "0",
//             "user-type": true
//         }
//     };

//     ChatLive_loadChatSuccess(message, chat_number);
// }

function ChatLive_CheckGiftSub(message) {
    var tags = message.tags;

    if (!tags || !tags.hasOwnProperty('msg-id')) return; //bad formatted message

    if (Main_A_includes_B(tags['msg-id'], "subgift")) {

        if (Main_A_equals_B(tags['msg-param-recipient-id'] + '', AddUser_UsernameArray[0].id + '') ||
            Main_A_equals_B(tags['msg-param-recipient-user-name'].toLowerCase() + '', AddUser_UsernameArray[0].name.toLowerCase() + '')) {

            ChatLive_Warn((Main_A_includes_B(tags['msg-id'] + '', 'anon') ? STR_GIFT_ANONYMOUS : tags['display-name']) +
                STR_GIFT_SUB, 10000);
        }
    }// else console.log(JSON.stringify(message));

    // tag:
    // badge-info: "subscriber/2"
    // badges: "subscriber/0,premium/1"
    // color: true
    // display-name: "marti_c16"
    // emotes: true
    // flags: true
    // id: "2748827c-cd12-4b9f-b73f-34aff4c53c41"
    // login: "marti_c16"
    // mod: "0"
    // msg-id: "subgift"
    // msg-param-months: "2"
    // msg-param-origin-id: "da\s39\sa3\see\s5e\s6b\s4b\s0d\s32\s55\sbf\sef\s95\s60\s18\s90\saf\sd8\s07\s09"
    // msg-param-recipient-display-name: "Mayohnee"
    // msg-param-recipient-id: "208812945"
    // msg-param-recipient-user-name: "mayohnee"
    // msg-param-sender-count: "0"
    // msg-param-sub-plan: "1000"
    // msg-param-sub-plan-name: "Channel\sSubscription\s(fedmyster)"
    // room-id: "39040630"
    // subscriber: "1"
    // system-msg: "marti_c16\sgifted\sa\sTier\s1\ssub\sto\sMayohnee!"
    // tmi-sent-ts: "1586752394924"
    // user-id: "496014406"
    // user-type: true

}

function ChatLive_loadChatSuccess(message, chat_number) {
    var div = '',
        tags = message.tags,
        nick,
        nickColor,
        highlighted,
        action,
        emotes = null,
        badges, badge,
        i, len;

    if (!tags || !tags.hasOwnProperty('display-name')) {
        return; //bad formatted message
    }

    if (tags.hasOwnProperty('msg-id')) {
        if (Main_A_includes_B(tags['msg-id'], "highlighted-message")) {
            highlighted = ' chat_highlighted';
            ChatLive_LineAdd('<span class="message">' + STR_BR + STR_CHAT_REDEEMED_MESSAGE_HIGH + '</span>', chat_number);
        } else if (Main_A_includes_B(tags['msg-id'], "skip-subs-mode-message")) {
            highlighted = ' chat_highlighted';
            ChatLive_LineAdd('<span class="message">' + STR_BR + STR_CHAT_REDEEMED_MESSAGE_SUB + '</span>', chat_number);
        }
    }

    //Add badges
    if (tags.hasOwnProperty('badges')) {
        if (typeof tags.badges === 'string') {

            badges = tags.badges.split(',');

            for (i = 0, len = badges.length; i < len; i++) {
                badge = badges[i].split('/');

                div += '<span class="' + badge[0] + chat_number + '-' + badge[1] + ' tag"></span>';
            }
        }
    }

    //Add message
    var mmessage = message.params[1];
    //For some bug on the chat implementation some message comes with the raw message of the next message
    //Remove the next to fix current... next will be lost as is not correctly formated
    if (Main_A_includes_B(mmessage, 'PRIVMSG')) mmessage = mmessage.split('@badge-info=')[0];

    if (/^\x01ACTION.*\x01$/.test(mmessage)) {
        action = true;
        mmessage = mmessage.replace(/^\x01ACTION/, '').replace(/\x01$/, '').trim();
    }

    //Add nick
    nick = tags['display-name'];
    nickColor = (typeof tags.color !== "boolean") ? tags.color : (defaultColors[(nick).charCodeAt(0) % defaultColorsLength]);

    nickColor = 'style="color: ' + calculateColorReplacement(nickColor) + ';"';

    div += '<span ' + (action ? ('class="class_bold" ' + nickColor) : '') +
        nickColor + '>' + nick + '</span>' + (action ? '' : '&#58;') + '&nbsp;';

    //Add default emotes
    if (tags.hasOwnProperty('emotes')) {

        if (typeof tags.emotes === 'string') {

            tags.emotes = tags.emotes.split('/');

            var emote, replacements, replacement, j, len_j;
            emotes = {};

            for (i = 0, len = tags.emotes.length; i < len; i++) {
                emote = tags.emotes[i].split(':');

                if (!emotes[emote[0]]) emotes[emote[0]] = [];

                replacements = emote[1].split(',');

                for (j = 0, len_j = replacements.length; j < len_j; j++) {
                    replacement = replacements[j].split('-');

                    emotes[emote[0]].push([parseInt(replacement[0]), parseInt(replacement[1])]);
                }
            }
        }
    }

    div += '<span class="message' + highlighted + (action ? (' class_bold" ' + nickColor) : '"') + '>' +
        ChatLive_extraMessageTokenize(
            emoticonize(mmessage, emotes),
            chat_number,
            ((tags.hasOwnProperty('bits') && cheers.hasOwnProperty(ChatLive_selectedChannel_id[chat_number])) ? parseInt(tags.bits) : 0)
        ) + '</span>';

    if (!Play_ChatDelayPosition) ChatLive_LineAdd(div, chat_number);
    else {
        var id = Chat_Id[chat_number];
        window.setTimeout(function() {
            if (id === Chat_Id[chat_number]) ChatLive_LineAdd(div, chat_number);
        }, (Play_controls[Play_controlsChatDelay].values[Play_controls[Play_controlsChatDelay].defaultValue] * 1000));
    }
}

function ChatLive_extraMessageTokenize(tokenizedMessage, chat_number, tags) {

    for (var i = 0, len = tokenizedMessage.length; i < len; i++) {

        if (typeof tokenizedMessage[i] === 'string') {

            tokenizedMessage[i] = extraMessageTokenize(tokenizedMessage[i], chat_number, tags);

        } else {

            tokenizedMessage[i] = tokenizedMessage[i][0];

        }
    }

    return twemoji.parse(tokenizedMessage.join(' '), true, true);
}

function ChatLive_LineAdd(message, chat_number) {
    if (ChatLive_Playing) {
        var elem = document.createElement('div');
        elem.className = 'chat_line';
        elem.innerHTML = message;

        Chat_div[chat_number].appendChild(elem);

        ChatLive_LineAddCounter[chat_number]++;
        if (ChatLive_LineAddCounter[chat_number] > Chat_CleanMax) {
            ChatLive_LineAddCounter[chat_number] = 0;
            Chat_Clean(chat_number);
        }
    } else {
        ChatLive_Messages[chat_number].push(message);
    }
}

function ChatLive_MessagesRunAfterPause() {
    var i, j,
        Temp_Messages = [];

    Temp_Messages[0] = Main_Slice(ChatLive_Messages[0]);
    ChatLive_Messages[0] = [];

    Temp_Messages[1] = Main_Slice(ChatLive_Messages[1]);
    ChatLive_Messages[1] = [];

    for (i = 0; i < 2; i++) {
        for (j = 0; j < Temp_Messages[i].length; j++) {
            ChatLive_LineAdd(Temp_Messages[i][j], i);
        }
    }
}

function ChatLive_ClearIds(chat_number) {
    ChatLive_CheckClear(chat_number);
    window.clearTimeout(ChatLive_socketSendCheckID);
    window.clearTimeout(ChatLive_loadBadgesChannelId);
}

function ChatLive_Clear(chat_number) {
    ChatLive_ClearIds(chat_number);

    Chat_Id[chat_number] = 0;
    ChatLive_LineAddCounter[chat_number] = 0;
    ChatLive_Messages[chat_number] = [];

    if (!chat_number) Main_empty('chat_box');
    else Main_empty('chat_box2');

    ChatLive_loaded[chat_number] = false;
    ChatLive_Banned[chat_number] = false;
    ChatLive_RoomState[chat_number] = null;

    ChatLive_CheckClear(chat_number);

    if (ChatLive_socket[chat_number] && ChatLive_loaded[chat_number] &&
        ChatLive_socket[chat_number].readyState === 1 &&
        AddUser_IsUserSet() && AddUser_UsernameArray[0].access_token) {
        ChatLive_socket[chat_number].send('PART ' + ChatLive_selectedChannel[chat_number] + '\r\n');
        ChatLive_socket[chat_number].close(1000);
    } else if (ChatLive_socket[chat_number]) {
        ChatLive_socket[chat_number].close(1000);
    }

    if (!chat_number) ChatLive_SendClose();

}


function ChatLive_BaseLoadUrl(id, theUrl, chat_number, tryes, callbackSucess, callbackError, Headers, HeaderQuatity) {
    var xmlHttp = new XMLHttpRequest();

    xmlHttp.open("GET", theUrl, true);

    if (Headers) {

        if (HeaderQuatity > 2) Headers[2][1] = Main_OAuth + AddUser_UsernameArray[0].access_token;

        for (var i = 0; i < HeaderQuatity; i++)
            xmlHttp.setRequestHeader(Headers[i][0], Headers[i][1]);
    }

    xmlHttp.timeout = 10000;
    xmlHttp.ontimeout = function() {};

    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState === 4) {
            if (xmlHttp.status === 200) {
                callbackSucess(xmlHttp.responseText, chat_number, id);
            } else if (xmlHttp.status !== 404) {//404 ignore the result is empty
                callbackError(tryes, chat_number, id);
            }
        }
    };

    xmlHttp.send(null);
}
