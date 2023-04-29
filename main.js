'use strict';

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");

/* Variables for runtime */
let globalConfig = {};
let sourceObject = {};
let settingsObject = {};
let rawValues = {
	values: {}
};
let outputValues = {
	values: {},
	unit: {},
	animations: {},
	fillValues: {}
};

class EnergieflussErweitert extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'energiefluss-erweitert',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		await this.setObjectNotExistsAsync('configuration', {
			type: 'state',
			common: {
				name: 'Parameters for HTML Output',
				type: 'json',
				role: 'state',
				read: true,
				write: false,
				def: '{}'
			},
			native: {},
		});

		await this.setObjectNotExistsAsync('data', {
			type: 'state',
			common: {
				name: 'Data for HTML Output',
				type: 'json',
				role: 'state',
				read: true,
				write: false,
			},
			native: {},
		});

		this.log.info("Adapter started and loading config!");

		this.getConfig();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		let clearValue;
		if (state) {
			// The state was changed
			if (id == this.namespace + '.configuration') {
				this.log.info('Configuration changed via Workspace! Reloading config!');
				this.getConfig();
			} else {
				if (typeof (state.val) === 'string') {
					clearValue = Number(state.val.replace(/[^\d.-]/g, ''));
				} else {
					clearValue = state.val;
				}

				// Loop through each Element, which belongs to that source
				if (sourceObject[id].hasOwnProperty('elmSources')) {
					for (var _key of Object.keys(sourceObject[id].elmSources)) {
						let src = sourceObject[id].elmSources[_key];
						// VALUES
						if (settingsObject.hasOwnProperty(src)) {
							this.log.debug("Settings for Element " + src + " found! Applying Settings!")
							// Convertible
							if (settingsObject[src].type == 'text') {
								let cValue = settingsObject[src].convert ? this.convertToPositive(clearValue) : clearValue;
								outputValues.values[src] = settingsObject[src].calculate_kw ? this.recalculateValue(cValue, settingsObject[src].decimal_places) : cValue;
								rawValues.values[src] = clearValue;
							} else {
								outputValues.fillValues[src] = clearValue;
							}
						} else {
							outputValues.values[src] = clearValue;
							rawValues.values[src] = clearValue;
						}
					}
				}

				// Animations
				if (sourceObject[id].hasOwnProperty('elmAnimations')) {
					this.log.debug('Found corresponding animations for ID: ' + id + '! Applying!');
					for (var anim in sourceObject[id].elmAnimations) {
						let animation = sourceObject[id].elmAnimations[anim];
						this.log.debug('Checking for Animation: ' + animation);
						let animationValid = true;
						let threshold = sourceObject[id].animationThreshold[anim];
						switch (sourceObject[id].animationProperties[anim]) {
							case 'positive':
								this.log.debug('Animation has a positive factor!');
								if (clearValue > 0) {
									if (clearValue > threshold) {
										this.log.debug('Value: ' + clearValue + ' is greater than Threshold: ' + threshold + ' Applying Animation!');
										animationValid = true;
									} else {
										this.log.debug('Value: ' + clearValue + ' is smaller than Threshold: ' + threshold + ' Deactivating Animation!');
										animationValid = false;
									}
								} else {
									animationValid = false;
								}
								break;
							case 'negative':
								this.log.debug('Animation has a negative factor!');
								if (clearValue < 0) {
									if (clearValue < threshold * -1) {
										this.log.debug('Value: ' + clearValue + ' is greater than Threshold: ' + threshold * -1 + ' Applying Animation!');
										animationValid = true;
									} else {
										this.log.debug('Value: ' + clearValue + ' is smaller than Threshold: ' + threshold * -1 + ' Deactivating Animation!');
										animationValid = false;
									}
								} else {
									animationValid = false;
								}
								break;
						}
						outputValues.animations[animation] = animationValid;
					}
				}

				this.log.debug('State changed! New value for Source: ' + id + ' with Value: ' + clearValue + ' belongs to Elements: ' + sourceObject[id].elmSources.toString());

				// Build Output
				this.buildData();
			}
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

	/**
	 * @param {number} value
	 */
	recalculateValue(value, decimal_places) {
		return (Math.round((value / 1000) * 100) / 100).toFixed(decimal_places);
	}

	convertToPositive(value) {
		return value < 0 ? (value * -1) : value;
	}

	async buildData() {
		await this.setStateAsync('data', JSON.stringify(outputValues), true);
	}

	async getConfig() {
		// Reset the Arrays/Objects
		globalConfig = {};
		outputValues = {
			values: {},
			unit: {},
			animations: {},
			fillValues: {},
			alternateValues: {}
		};
		rawValues = {
			values: {}
		};
		sourceObject = {};
		settingsObject = {};
		let clearValue;
		let tmpArray = new Array();
		// Put own DP
		tmpArray.push(this.namespace + '.configuration');
		// Read configuration DataPoint
		let tmpConfig = await this.getStateAsync('configuration');
		try {
			globalConfig = JSON.parse(tmpConfig.val);
		}
		catch (e) {
			this.log.warn("This is the first time, the adapter starts. Setting config to default (empty)!");
			globalConfig = {};
		}
		this.log.debug(JSON.stringify(globalConfig));

		// Collect all Datasources
		if (globalConfig.hasOwnProperty('datasources')) {
			for (var key of Object.keys(globalConfig.datasources)) {
				const value = globalConfig.datasources[key];
				this.log.debug('Datasource: ' + JSON.stringify(value));
				if (value.source != '' && value.hasOwnProperty('source')) {
					//addDataSourceRow(_key, key.source, key.alias);
					this.log.debug('Reading: Source: ' + value.source + ' ID: ' + key);
					const stateValue = await this.getForeignStateAsync(globalConfig.datasources[key].source);
					if (stateValue) {
						// Add, to find it better
						sourceObject[globalConfig.datasources[key].source] = {
							elmSources: [],
							elmAnimations: [],
							animationProperties: [],
							animationThreshold: [],
							animationType: [],
							animationPower: [],
							animationDots: [],
							animationSpeed: []
						};
						// Add to SubscribeArray
						tmpArray.push(value.source);
					} else {
						this.log.warn("The adapter could not find the state '" + value.source + "'! Please review your configuration of the adapter!");
					}
				}
			}
		}

		// Collect the Elements, which are using the sources
		if (globalConfig.hasOwnProperty('elements')) {
			for (var key of Object.keys(globalConfig.elements)) {
				const value = globalConfig.elements[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					this.log.debug("Source for Element: " + key + " is: " + value.source + " Plain: " + globalConfig.datasources[value.source].source);
					const stateValue = await this.getForeignStateAsync(globalConfig.datasources[value.source].source);
					if (stateValue) {
						// Insert into initialValues
						if (typeof (stateValue.val) === 'string') {
							clearValue = Number(stateValue.val.replace(/[^\d.-]/g, ''));
						} else {
							clearValue = stateValue.val;
						}

						// Output Values
						if (value.type == 'text') {
							let cValue = value.convert ? this.convertToPositive(clearValue) : clearValue;
							outputValues.values[key] = value.calculate_kw ? this.recalculateValue(cValue, value.decimal_places) : cValue;
							outputValues.unit[key] = value.unit;
							rawValues.values[key] = clearValue;
						} else {
							outputValues.fillValues[key] = clearValue;
						}

						// Save Settings for the states
						settingsObject[key] = {
							threshold: value.threshold,
							calculate_kw: value.calculate_kw,
							decimal_places: value.decimal_places,
							convert: value.convert,
							type: value.type
						};
						// Put Elm into Source
						sourceObject[globalConfig.datasources[value.source].source].elmSources.push(key);
					}
				}
			}
		}

		// Animations
		if (globalConfig.hasOwnProperty('animations')) {
			for (var key of Object.keys(globalConfig.animations)) {
				const value = globalConfig.animations[key];
				if (value.source != -1 && value.hasOwnProperty('source')) {
					if (value.source.length !== 0) {
						this.log.debug("Animation for Source: " + value.source + " is: " + key);
						// Put Animation into Source
						sourceObject[globalConfig.datasources[value.source].source].elmAnimations.push(key);

						// Put Animation Properties into Source
						sourceObject[globalConfig.datasources[value.source].source].animationProperties.push(value.animation_properties);

						// Put Animation Threshold into Source
						sourceObject[globalConfig.datasources[value.source].source].animationThreshold.push(value.threshold);

						// Put Animation Settings into Source
						sourceObject[globalConfig.datasources[value.source].source].animationType.push(value.animation_type ? value.animation_type : '');
						sourceObject[globalConfig.datasources[value.source].source].animationSpeed.push(value.speed ? value.speed : '');
						sourceObject[globalConfig.datasources[value.source].source].animationPower.push(value.power ? value.power : '');
						sourceObject[globalConfig.datasources[value.source].source].animationDots.push(value.power ? value.dots : '');
					} else {
						this.log.debug("Animation for Source: " + value.source + " not found!");
					}
				}
			}
		}

		this.log.debug('Settings: ' + JSON.stringify(settingsObject));
		this.log.debug("Initial Values: " + JSON.stringify(outputValues.values));
		this.log.debug("Initial Fill-Values: " + JSON.stringify(outputValues.fillValues));
		this.log.debug('Sources: ' + JSON.stringify(sourceObject));
		this.buildData();

		this.log.info('Configuration loaded!');
		this.log.info("Requesting the following states: " + tmpArray.toString());

		// Renew the subscriptions
		this.subscribeForeignStates(tmpArray);
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new EnergieflussErweitert(options);
} else {
	// otherwise start the instance directly
	new EnergieflussErweitert();
}