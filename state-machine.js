/*****

node-red-contrib-state-machine - A Node Red node to implement a state machine using javascript-state-machine

(https://www.npmjs.com/package/java-script-state-machine)

MIT License

Copyright (c) 2018 Dean Cording  <dean@cording.id.au>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Core dependency
const StateMachine = require('javascript-state-machine')

function camelize(label) {
  if (label.length === 0) return label

  let n,
    result,
    word,
    words = label.split(/[_-]/)

  // single word with first character already lowercase, return untouched
  if (words.length === 1 && words[0][0].toLowerCase() === words[0][0]) return label

  result = words[0].toLowerCase()
  for (n = 1; n < words.length; n++) {
    result = result + words[n].charAt(0).toUpperCase() + words[n].substring(1).toLowerCase()
  }

  return result
}

module.exports = function (RED) {
  let store = {}

  function StateMachineNode(config) {
    RED.nodes.createNode(this, config)
    let node = this

    let stateProperty = config.stateProperty || 'topic'
    let statePropertyType = config.statePropertyType || 'msg'

    let states = config.states || []
    let transitions = config.transitions || []

    let init = config.persistOnReload && store[node.id] ? store[node.id] : states[0]
    try {
      node.fsm = new StateMachine({ init, transitions })
    } catch (e) {
      node.status({ fill: 'red', shape: 'dot', text: e.message })
      throw e
    }

    node.status({ fill: 'green', shape: 'dot', text: init })

    if (statePropertyType === 'flow') {
      node.context().flow.set(stateProperty, init)
    } else if (statePropertyType === 'global') {
      node.context().global.set(stateProperty, init)
    }

    node.startup = function () {
      if (statePropertyType === 'msg') {
        msg = {}
        RED.util.setMessageProperty(msg, stateProperty, node.fsm.state)
        // Send preserved state delayed to give other nodes a chance to activate on flows:started
        setTimeout( () => { node.send(msg); }, 8000)
      }
    }

    RED.events.on('flows:started', node.startup)

    node.on('close', function () {
      RED.events.removeListener('flows:started', node.startup)
    })

    node.on('input', function (msg) {
      let trigger = RED.util.evaluateNodeProperty(
        config.triggerProperty || 'topic',
        config.triggerPropertyType || 'msg',
        node,
        msg
      )

      let transition = false

      if (node.fsm.can(trigger)) {
        trigger = camelize(trigger)
        node.fsm[trigger]()
        transition = true
      } else if (config.throwException) {
        node.error(`Can not transition '${trigger}' from state '${node.fsm.state}'`)
        return null
      }

      if (transition || !config.outputStateChangeOnly) {
        if (statePropertyType === 'msg') {
          RED.util.setMessageProperty(msg, stateProperty, node.fsm.state)
        } else if (statePropertyType === 'flow') {
          node.context().flow.set(stateProperty, node.fsm.state)
        } else if (statePropertyType === 'global') {
          node.context().global.set(stateProperty, node.fsm.state)
        }
        node.send(msg)

        store[node.id] = node.fsm.state

        node.status({ fill: 'green', shape: 'dot', text: node.fsm.state })
      }
    })
  }
  RED.nodes.registerType('state-machine', StateMachineNode)

  RED.httpAdmin.get('/fsm/graph.js', function (req, res) {
    res.sendFile(`${__dirname}/graph.js`)
  })
}
