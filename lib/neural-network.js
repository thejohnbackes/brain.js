'use strict';

var lookup = require('./lookup');
var TrainStream = require('./train-stream');

/**
 *
 * @param {object} options
 * @constructor
 */
function NeuralNetwork(options) {
  options = options || {};
  this.learningRate = options.learningRate || 0.3;
  this.momentum = options.momentum || 0.1;
  this.hiddenSizes = options.hiddenLayers;

  this.binaryThresh = options.binaryThresh || 0.5;

  this.sizes = null;
  this.outputLayer = null;
  this.biases = null; // weights for bias nodes
  this.weights = null;
  this.outputs = null;

  // state for training
  this.deltas = null;
  this.changes = null; // for momentum
  this.errors = null;
}

NeuralNetwork.prototype = {
  /**
   *
   * @param {} sizes
   * @param {Boolean} keepNetworkIntact
   */
  initialize: function(sizes, keepNetworkIntact) {
    this.sizes = sizes;
    this.outputLayer = this.sizes.length - 1;

    if (!keepNetworkIntact) {
      this.biases = []; // weights for bias nodes
      this.weights = [];
      this.outputs = [];
    }

    // state for training
    this.deltas = [];
    this.changes = []; // for momentum
    this.errors = [];

    for (var layer = 0; layer <= this.outputLayer; layer++) {
      var size = this.sizes[layer];
      this.deltas[layer] = zeros(size);
      this.errors[layer] = zeros(size);
      if (!keepNetworkIntact) {
        this.outputs[layer] = zeros(size);
      }

      if (layer > 0) {
        this.biases[layer] = randos(size);
        if (!keepNetworkIntact) {
          this.weights[layer] = new Array(size);
        }
        this.changes[layer] = new Array(size);

        for (var node = 0; node < size; node++) {
          var prevSize = this.sizes[layer - 1];
          if (!keepNetworkIntact) {
            this.weights[layer][node] = randos(prevSize);
          }
          this.changes[layer][node] = zeros(prevSize);
        }
      }
    }
  },

  /**
   *
   * @param input
   * @returns {*}
   */
  run: function(input) {
    if (this.inputLookup) {
      input = lookup.toArray(this.inputLookup, input);
    }

    var output = this.runInput(input);

    if (this.outputLookup) {
      output = lookup.toHash(this.outputLookup, output);
    }
    return output;
  },

  /**
   *
   * @param input
   * @returns {*}
   */
  runInput: function(input) {
    this.outputs[0] = input;  // set output state of input layer

    for (var layer = 1; layer <= this.outputLayer; layer++) {
      for (var node = 0; node < this.sizes[layer]; node++) {
        var weights = this.weights[layer][node];

        var sum = this.biases[layer][node];
        for (var k = 0; k < weights.length; k++) {
          sum += weights[k] * input[k];
        }
        this.outputs[layer][node] = 1 / (1 + Math.exp(-sum));
      }
      var output = input = this.outputs[layer];
    }
    return output;
  },

  /**
   *
   * @param data
   * @param options
   * @returns {{error: number, iterations: number}}
   */
  train: function(data, options) {
    data = this.formatData(data);

    options = options || {};
    var iterations = options.iterations || 20000;
    var errorThresh = options.errorThresh || 0.005;
    var log = options.log ? (typeof options.log === 'function' ? options.log : console.log) : false;
    var logPeriod = options.logPeriod || 10;
    var learningRate = options.learningRate || this.learningRate || 0.3;
    var callback = options.callback;
    var callbackPeriod = options.callbackPeriod || 10;
    var sizes = [];
    var inputSize = data[0].input.length;
    var outputSize = data[0].output.length;
    var hiddenSizes = this.hiddenSizes;
    if (!hiddenSizes) {
      sizes.push(Math.max(3, Math.floor(inputSize / 2)));
    } else {
      hiddenSizes.forEach(function(size) {
        sizes.push(size);
      });
    }

    sizes.unshift(inputSize);
    sizes.push(outputSize);

    this.initialize(sizes, options.keepNetworkIntact);

    var error = 1;
    for (var i = 0; i < iterations && error > errorThresh; i++) {
      var sum = 0;
      for (var j = 0; j < data.length; j++) {
        var err = this.trainPattern(data[j].input, data[j].output, learningRate);
        sum += err;
      }
      error = sum / data.length;

      if (log && (i % logPeriod == 0)) {
        log('iterations:', i, 'training error:', error);
      }
      if (callback && (i % callbackPeriod == 0)) {
        callback({ error: error, iterations: i });
      }
    }

    return {
      error: error,
      iterations: i
    };
  },

  /**
   *
   * @param input
   * @param target
   * @param learningRate
   */
  trainPattern : function(input, target, learningRate) {
    learningRate = learningRate || this.learningRate;

    // forward propagate
    this.runInput(input);

    // back propagate
    this.calculateDeltas(target);
    this.adjustWeights(learningRate);

    var error = mse(this.errors[this.outputLayer]);
    return error;
  },

  /**
   *
   * @param target
   */
  calculateDeltas: function(target) {
    for (var layer = this.outputLayer; layer >= 0; layer--) {
      for (var node = 0; node < this.sizes[layer]; node++) {
        var output = this.outputs[layer][node];

        var error = 0;
        if (layer == this.outputLayer) {
          error = target[node] - output;
        }
        else {
          var deltas = this.deltas[layer + 1];
          for (var k = 0; k < deltas.length; k++) {
            error += deltas[k] * this.weights[layer + 1][k][node];
          }
        }
        this.errors[layer][node] = error;
        this.deltas[layer][node] = error * output * (1 - output);
      }
    }
  },

  /**
   *
   * @param learningRate
   */
  adjustWeights: function(learningRate) {
    for (var layer = 1; layer <= this.outputLayer; layer++) {
      var incoming = this.outputs[layer - 1];

      for (var node = 0; node < this.sizes[layer]; node++) {
        var delta = this.deltas[layer][node];

        for (var k = 0; k < incoming.length; k++) {
          var change = this.changes[layer][node][k];

          change = (learningRate * delta * incoming[k])
                   + (this.momentum * change);

          this.changes[layer][node][k] = change;
          this.weights[layer][node][k] += change;
        }
        this.biases[layer][node] += learningRate * delta;
      }
    }
  },

  /**
   *
   * @param data
   * @returns {*}
   */
  formatData: function(data) {
    if (data.constructor !== Array) { // turn stream datum into array
      var tmp = [];
      tmp.push(data);
      data = tmp;
    }
    // turn sparse hash input into arrays with 0s as filler
    var datum = data[0].input;
    if (datum.constructor !== Array && !(datum instanceof Float64Array)) {
      if (!this.inputLookup) {
        this.inputLookup = lookup.buildLookup(data.map(function(value) { return value['input']; }));
      }
      data = data.map(function(datum) {
        var array = lookup.toArray(this.inputLookup, datum.input);
        return Object.assign({}, datum, { input: array });
      }, this);
    }

    if (data[0].output.constructor !== Array) {
      if (!this.outputLookup) {
        this.outputLookup = lookup.buildLookup(data.map(function(value) { return value['output']; }));
      }
      data = data.map(function(datum) {
        var array = lookup.toArray(this.outputLookup, datum.output);
        return Object.assign({}, datum, { output: array });
      }, this);
    }
    return data;
  },

  /**
   *
   * @param data
   * @returns {
   *  {
   *    error: number,
   *    misclasses: Array
   *  }
   * }
   */
  test : function(data) {
    data = this.formatData(data);

    // for binary classification problems with one output node
    var isBinary = data[0].output.length == 1;
    var falsePos = 0;
    var falseNeg = 0;
    var truePos = 0;
    var trueNeg = 0;

    // for classification problems
    var misclasses = [];

    // run each pattern through the trained network and collect
    // error and misclassification statistics
    var sum = 0;
    for (var i = 0; i < data.length; i++) {
      var output = this.runInput(data[i].input);
      var target = data[i].output;

      var actual, expected;
      if (isBinary) {
        actual = output[0] > this.binaryThresh ? 1 : 0;
        expected = target[0];
      }
      else {
        actual = output.indexOf(max(output));
        expected = target.indexOf(max(target));
      }

      if (actual != expected) {
        var misclass = data[i];
        Object.assign(misclass, {
          actual: actual,
          expected: expected
        });
        misclasses.push(misclass);
      }

      if (isBinary) {
        if (actual == 0 && expected == 0) {
          trueNeg++;
        }
        else if (actual == 1 && expected == 1) {
          truePos++;
        }
        else if (actual == 0 && expected == 1) {
          falseNeg++;
        }
        else if (actual == 1 && expected == 0) {
          falsePos++;
        }
      }

      var errors = output.map(function(value, i) {
        return target[i] - value;
      });
      sum += mse(errors);
    }
    var error = sum / data.length;

    var stats = {
      error: error,
      misclasses: misclasses
    };

    if (isBinary) {
      Object.assign(stats, {
        trueNeg: trueNeg,
        truePos: truePos,
        falseNeg: falseNeg,
        falsePos: falsePos,
        total: data.length,
        precision: truePos / (truePos + falsePos),
        recall: truePos / (truePos + falseNeg),
        accuracy: (trueNeg + truePos) / data.length
      });
    }
    return stats;
  },

  /**
   *
   * @returns
   *  {
   *    layers: [
   *      {
   *        x: {},
   *        y: {}
   *      },
   *      {
   *        '0': {
   *          bias: -0.98771313,
   *          weights: {
   *            x: 0.8374838,
   *            y: 1.245858
   *          },
   *        '1': {
   *          bias: 3.48192004,
   *          weights: {
   *            x: 1.7825821,
   *            y: -2.67899
   *          }
   *        }
   *      },
   *      {
   *        f: {
   *          bias: 0.27205739,
   *          weights: {
   *            '0': 1.3161821,
   *            '1': 2.00436
   *          }
   *        }
   *      }
   *    ]
   *  }
   */
  toJSON: function() {
    var layers = [];
    for (var layer = 0; layer <= this.outputLayer; layer++) {
      layers[layer] = {};

      var nodes;
      // turn any internal arrays back into hashes for readable json
      if (layer == 0 && this.inputLookup) {
        nodes = Object.keys(this.inputLookup);
      }
      else if (layer == this.outputLayer && this.outputLookup) {
        nodes = Object.keys(this.outputLookup);
      }
      else {
        nodes = range(0, this.sizes[layer]);
      }

      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        layers[layer][node] = {};

        if (layer > 0) {
          layers[layer][node].bias = this.biases[layer][j];
          layers[layer][node].weights = {};
          for (var k in layers[layer - 1]) {
            var index = k;
            if (layer == 1 && this.inputLookup) {
              index = this.inputLookup[k];
            }
            layers[layer][node].weights[k] = this.weights[layer][j][index];
          }
        }
      }
    }
    return { layers: layers, outputLookup:!!this.outputLookup, inputLookup:!!this.inputLookup };
  },

  /**
   *
   * @param json
   * @returns {NeuralNetwork}
   */
  fromJSON: function(json) {
    var size = json.layers.length;
    this.outputLayer = size - 1;

    this.sizes = new Array(size);
    this.weights = new Array(size);
    this.biases = new Array(size);
    this.outputs = new Array(size);

    for (var i = 0; i <= this.outputLayer; i++) {
      var layer = json.layers[i];
      if (i == 0 && (!layer[0] || json.inputLookup)) {
        this.inputLookup = lookup.lookupFromHash(layer);
      }
      else if (i == this.outputLayer && (!layer[0] || json.outputLookup)) {
        this.outputLookup = lookup.lookupFromHash(layer);
      }

      var nodes = Object.keys(layer);
      this.sizes[i] = nodes.length;
      this.weights[i] = [];
      this.biases[i] = [];
      this.outputs[i] = [];

      for (var j in nodes) {
        var node = nodes[j];
        this.biases[i][j] = layer[node].bias;
        this.weights[i][j] = toArray(layer[node].weights);
      }
    }
    return this;
  },

  /**
   *
   * @returns {Function}
   */
  toFunction: function() {
    var json = this.toJSON();
    // return standalone function that mimics run()
    return new Function('input',
'  var net = ' + JSON.stringify(json) + ';\n\n\
  for (var i = 1; i < net.layers.length; i++) {\n\
    var layer = net.layers[i];\n\
    var output = {};\n\
    \n\
    for (var id in layer) {\n\
      var node = layer[id];\n\
      var sum = node.bias;\n\
      \n\
      for (var iid in node.weights) {\n\
        sum += node.weights[iid] * input[iid];\n\
      }\n\
      output[id] = (1 / (1 + Math.exp(-sum)));\n\
    }\n\
    input = output;\n\
  }\n\
  return output;');
  },

  /**
   * This will create a TrainStream (WriteStream) for us to send the training data to.
   * @param opts training options
   * @returns {TrainStream|*}
   */
  createTrainStream: function(opts) {
    opts = opts || {};
    opts.neuralNetwork = this;
    this.trainStream = new TrainStream(opts);
    return this.trainStream;
  }
};

/**
 *
 * @returns {number}
 */
function randomWeight() {
  return Math.random() * 0.4 - 0.2;
}

/**
 *
 * @param size
 * @returns {Array}
 */
function zeros(size) {
  var array = new Array(size);
  for (var i = 0; i < size; i++) {
    array[i] = 0;
  }
  return array;
}

/**
 *
 * @param size
 * @returns {Array}
 */
function randos(size) {
  var array = new Array(size);
  for (var i = 0; i < size; i++) {
    array[i] = randomWeight();
  }
  return array;
}

/**
 * mean squared error
 * @param errors
 * @returns {number}
 */
function mse(errors) {
  var sum = 0;
  for (var i = 0; i < errors.length; i++) {
    sum += Math.pow(errors[i], 2);
  }
  return sum / errors.length;
}

/**
 *
 * @param start
 * @param end
 * @returns {Array}
 */
function range(start, end) {
  var result = [];
  for (; start < end; start++) {
    result.push(start);
  }
  return result;
}

/**
 *
 * @param values
 * @returns {*}
 */
function toArray(values) {
  values = values || [];
  if (values.constructor === Array) {
    return values;
  } else {
    return Object.keys(values).map(function(key) { return values[key]; });
  }
}

/**
 *
 * @param values
 * @returns {number}
 */
function max(values) {
  return Math.max.apply(Math, toArray(values));
}

module.exports = NeuralNetwork;
