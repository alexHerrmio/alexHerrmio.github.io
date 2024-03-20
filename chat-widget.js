
let socket;
let chatConfigGlobal
let isFirstMessage = true


async function initializeWidget(chatConfig) {
    await injectHTML(chatConfig)
    loadCSS()
    chatConfigGlobal = chatConfig

    socket = new WebSocket('wss://webmessaging.' + chatConfig.region + '/v1?deploymentId=' + chatConfig.deploymentId)

    try {
        socket.onopen = async function (event) {
            console.log('open')
            if (localStorage.getItem('gc_webtoken')) {
                let connection = {
                    action: 'configureSession',
                    deploymentId: chatConfig.deploymentId,
                    token: localStorage.getItem('gc_webtoken'),
                }
                socket.send(JSON.stringify(connection))
            }
            if (!localStorage.getItem('gc_webtoken')) {
                localStorage.setItem('gc_webtoken', uuidv4())
                let connection = {
                    action: 'configureSession',
                    deploymentId: chatConfig.deploymentId,
                    token: localStorage.getItem('gc_webtoken'),
                }
                socket.send(JSON.stringify(connection))
            }
        }

        socket.onmessage = async function (event) {
            let details = JSON.parse(event.data)
            if (details.type !== 'response' && details.body.text !== 'ping') console.log(details)

            if (details.body.connected) {
                console.log('wss connected ok')

                setInterval(function () {
                    let heart = {
                        action: 'echo',
                        message: {
                            type: 'Text',
                            text: 'ping',
                        },
                    }
                    socket.send(JSON.stringify(heart))
                }, 60000)

                if (!details.body.newSession && document.getElementById('messages').innerText === '') {
                    document.getElementById('progressbar').style.width = '25%'
                    socket.send(
                        JSON.stringify({
                            action: 'getJwt',
                            token: localStorage.getItem('gc_webtoken'),
                        })
                    )
                }
            }

            if (details.class === 'JwtResponse') {
                //GETTING old messages
                let response = await fetch('https://api.' + chatConfig.region + '/api/v2/webmessaging/messages?pageNumber=1', {
                    headers: {
                        Authorization: 'Bearer ' + details.body.jwt,
                        Origin: document.domain,
                    },
                })
                let history = await response.json()
                console.log(history)
                document.getElementById('progressbar').style.width = '75%'

                if (history.total > 0) {
                    //go through each message and append it to the widget
                    for (const message of history.entities.reverse()) {
                        let name = ''
                        if (message.channel?.from?.nickname) {
                            name = message.channel.from.nickname
                        } else {
                            name = message.originatingEntity
                        }
                        let image = ''
                        if (message.channel?.from?.image) {
                            image = message.channel.from.image
                        } else {
                            image = ''
                        }
                        //Receive text message
                        if (message.type === 'Text' && message.direction === 'Outbound' && message.text !== undefined) {
                            createAgentMsg(message.text)
                        }
                        if (message.type === 'Text' && message.direction === 'Inbound' && message.text !== undefined) {
                            createCustomerMsg(message.text)
                        }
                        if (message.type === 'Text' && message.direction === 'Inbound' && message.text === undefined) {
                            createCustomerMsg(message.content[0].attachment.url)
                        }
                        //RichMedia Message QuickReply
                        if (message.type === 'Structured' && message.direction === 'Outbound') {
                            createAgentMsg(message.text)
                            let card = document.createElement('div')
                            let body = document.createElement('div')
                            card.className = 'card m-2 border-light'
                            card.id = 'quickReplies'
                            for (const quick of message.content) {
                                if (quick.contentType === 'QuickReply') {
                                    let button = document.createElement('button')
                                    body.className = 'card-body'
                                    button.className = 'm-1 btn btn-outline-secondary btn-sm'
                                    button.innerHTML = quick.quickReply.text
                                    button.onclick = function () {
                                        wssSend(quick.quickReply.text)
                                    }
                                    body.appendChild(button)
                                    card.appendChild(body)
                                }
                            }
                            document.getElementById('messages').appendChild(card)
                            document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
                            console.log('Structured message: ', details.body.text)
                        }
                    }
                    document.getElementById('progressbar').style.width = '100%'
                    setTimeout(function () {
                        document.getElementById('progressbar').style.width = '0'
                        document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
                    }, 2000)
                }

                if (history.total === 0) {
                    console.log('no existing messages for token: ', localStorage.getItem('gc_webtoken'))
                    document.getElementById('progressbar').style.width = '100%'
                    setTimeout(function () {
                        document.getElementById('progressbar').style.width = '0%'
                        document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
                    }, 2000)
                }
            }


            if (details.type === 'message') {
                //remove typing indicator if still active
                if (document.getElementById('typing')) {
                    document.getElementById('typing').remove()
                }
                let name = ''
                if (details.body.channel?.from?.nickname) {
                    name = details.body.channel.from.nickname
                } else {
                    name = details.body.originatingEntity
                }
                let image = ''
                if (details.body.channel?.from?.image) {
                    image = details.body.channel.from.image
                } else {
                    image = ''
                }
                //Receive text message
                if (details.body.type === 'Text' && details.body.direction === 'Outbound' && details.body.text !== undefined) {
                    createAgentMsg(details.body.text)
                    console.log('Text message: ', details.body.text)
                }
                if (details.body.type === 'Text' && details.body.direction === 'Inbound' && details.body.text !== undefined) {
                    createCustomerMsg(details.body.text)
                    console.log('Text message: ', details.body.text)
                }
                if (details.body.type === 'Text' && details.body.direction === 'Inbound' && details.body.text === undefined) {
                    createCustomerMsg(details.body.content[0].attachment.url)
                    console.log('Text message: ', details.body.content[0].attachment.url)
                }
                //RichMedia Message QuickReply
                if (details.body.type === 'Structured' && details.body.direction === 'Outbound') {
                    createAgentMsg(details.body.text)
                    let card = document.createElement('div')
                    let body = document.createElement('div')
                    card.className = 'card m-2 border-light'
                    card.id = 'quickReplies'
                    for (const quick of details.body.content) {
                        if (quick.contentType === 'QuickReply') {
                            let button = document.createElement('button')
                            body.className = 'card-body'
                            button.className = 'm-1 btn btn-outline-secondary btn-sm'
                            button.innerHTML = quick.quickReply.text
                            button.onclick = function () {
                                wssSend(quick.quickReply.text)
                            }
                            body.appendChild(button)
                            card.appendChild(body)
                        }
                    }
                    document.getElementById('messages').appendChild(card)
                    document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
                    console.log('Structured message: ', details.body.text)
                }
                //typing indicator
                if (details.body.type === 'Event' && details.body.events[0].eventType === 'Typing' && details.body.direction === 'Outbound') {
                    createTypingIndicator()
                    setTimeout(() => {
                        if (document.getElementById('typing')) {
                            document.getElementById('typing').remove()
                        }
                    }, 5000)
                }
                if (document.getElementById('widget').className === 'toast hide') {
                    openChat()
                }
            }
        }
    } catch (err) {
        console.error(err)
    }

//Capture Enter key to send message
    let enter = document.getElementById('message')
    console.log('try to add  event');
    enter.addEventListener('keyup', function (event) {
        // Number 13 is the "Enter" key on the keyboard
        if (event.key === 'Enter') {
            // Trigger the button element with a click
            document.getElementById('sendButton').click()
        }
        if (event.key!== 'Enter') {
            if(!typing){
                typing = true
                wssSendTyping()
                setTimeout(() => {
                    typing = false
                }, 5000);
            }
        }
    })
}

async function injectHTML(chatConfig) {
    let sourceDiv = document.createElement('div');
    sourceDiv.id = 'parloa-chat-widget'
    await fetch("injectable.html")
        .then(response => {
            if (!response.ok) {
                throw new Error('Injectable could not been loaded');
            }
            return response.text();
        })
        .then(html => {
            sourceDiv.innerHTML = html;
        })
        .catch(error => {
            console.error('Error when loading injectable: ', error);
        });
    document.body.appendChild(sourceDiv)

    //Styling
    document.getElementsByClassName('toast-header')[0].style.setProperty("background", chatConfig.headerBgColor, "important");
    document.getElementsByClassName('toast-header')[0].style.color = chatConfig.headerTextColor
    document.querySelector('.toast-header svg').style.fill = chatConfig.headerTextColor

    document.querySelector('#chatButton button').style.background = chatConfig.customerCardBgColor
    document.querySelector('#chatButton button svg').style.fill = chatConfig.customerCardTextColor

    document.querySelector('.toast-body button').style.background = chatConfig.customerCardBgColor
    document.querySelector('.toast-body button svg').style.fill = chatConfig.customerCardTextColor

    document.getElementById('progressbar').style.backgroundColor = chatConfig.progressBarColor
}


function loadCSS() {
    let bootstrapLink = document.createElement("link");
    bootstrapLink.rel = "stylesheet";
    bootstrapLink.href = "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css";

    let cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "style.css";

    document.head.appendChild(bootstrapLink);
    document.head.appendChild(cssLink);

}

let typing = false

function clearToken() {
    localStorage.removeItem('gc_webtoken')
    window.location.reload()
}

function openChat() {
    if (isFirstMessage) {
        wssSend("FIRST_MESSAGE")
    }
    document.getElementById('widget').className = 'toast show'
    document.getElementById('chatButton').className = 'toast hide'
    document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
}
function closeChat() {
    document.getElementById('widget').className = 'toast hide'
    document.getElementById('chatButton').className = 'toast show'
}

function createCustomerMsg(message) {
    isFirstMessage = false;
    if (message !== 'FIRST_MESSAGE') {
        message = message.replace(/<[^>]*>/g, '');

        let card = document.createElement('div')
        let body = document.createElement('div')
        let text = document.createElement('p')

        card.className = 'card text-end end-0 m-2 customer-card'
        card.style.background = chatConfigGlobal.customerCardBgColor

        body.className = 'card-body'

        text.className = 'card-text'
        text.style.color = chatConfigGlobal.customerCardTextColor
        text.innerHTML = message

        body.appendChild(text)
        card.appendChild(body)
        document.getElementById('messages').appendChild(card)
        document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
    }
}

function createAgentMsg(message) {
    console.log('Agent Message:' + message);
    let card = document.createElement('div')
    let body = document.createElement('div')
    let text = document.createElement('p')
    card.className = 'card m-2 agent-card'
    card.style.background = chatConfigGlobal.agentCardBgColor


    body.className = 'card-body'

    text.className = 'card-text'
    text.style.color = chatConfigGlobal.agentCardTextColor
    text.innerHTML = message //marked(body) //enables markdown support

    body.appendChild(text)
    card.appendChild(body)
    document.getElementById('messages').appendChild(card)
    document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
}

function createTypingIndicator() {
    let typing = document.createElement('div')
    let div1 = document.createElement('div')
    let div2 = document.createElement('div')
    let div3 = document.createElement('div')

    typing.id = 'typing'
    typing.className = 'typingIndicatorBubble'
    div1.className = 'typingIndicatorBubbleDot'
    div2.className = 'typingIndicatorBubbleDot'
    div3.className = 'typingIndicatorBubbleDot'
    typing.appendChild(div1)
    typing.appendChild(div2)
    typing.appendChild(div3)
    document.getElementById('messages').appendChild(typing)
    document.getElementById('messages').scrollTo(0, document.getElementById('messages').scrollHeight)
}

async function wssSend(message) {
    //to stop blank messages being sent
    if (message === '') {
        document.getElementById('message').placeholder = 'Please enter a msg...'
    }

    if (message !== '') {
        let json = {
            action: 'onMessage',
            token: localStorage.getItem('gc_webtoken'),
            message: {
                type: 'Text',
                text: message,
            },
        }
        socket.send(JSON.stringify(json))
        document.getElementById('message').value = ''
    }
    if (!localStorage.getItem('gc_webtoken')) {
        console.error('No gc_webtoken how did you even get here??')
    }
}

async function wssSendTyping() {
    let json = {
        action: 'onMessage',
        token: localStorage.getItem('gc_webtoken'),
        message: {
            type: 'Event',
            events: [
                {
                    eventType: 'Typing',
                    typing: {
                        type: 'On',
                    },
                },
            ],
        },
    }
    socket.send(JSON.stringify(json))
}

//JavaScript Native way to generate uuidv4
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}



