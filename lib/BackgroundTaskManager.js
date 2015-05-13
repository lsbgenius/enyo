require('enyo');

/**
* Returns the BackgroundTaskManager singleton.
* @module enyo/BackgroundTaskManager
*/

var
	kind = require('./kind'),
	utils = require('./utils');

var
	CoreObject = require('./CoreObject'),
	SystemMonitor = require('./SystemMonitor'),
	Loop = require('./Loop'),
	Priorities = require('./PriorityQueue').Priorities;

module.exports = kind.singleton(
	/** @lends module:enyo/BackgroundTaskManager */ {

	/**
	* @private
	*/
	name: 'enyo.BackgroundTaskManager',

	/**
	* @private
	*/
	kind: CoreObject,

	/**
	* @private
	*/
	fpsThreshold: 55,

	/**
	* @private
	*/
	frameThreshold: 4,

	/**
	* @private
	*/
	customers: [],

	/**
	* @private
	*/
	namedCustomers: {},

	/**
	* @private
	*/
	constructor: kind.inherit( function (sup) {
		return function () {
			var c, p, f = 0, d = 1000 / this.fpsThreshold;

			sup.apply(this, arguments);

			this.cb = this.bindSafely(function() {
				if (this.customers.length) {
					if (!SystemMonitor.active) {
						SystemMonitor.trigger();
					}

					if (!c) {
						c = utils.perfNow();
					} else {
						p = c;
						c = utils.perfNow();
						f = ((c - p) < d) ? f + 1 : 0;
					}
					if (f == this.frameThreshold && SystemMonitor.idle()) {
						this.run();
						c = p = f = 0;
					} else {
						// reset fps check if threshold is met but system is not user-idle
						if (f == this.frameThreshold) {
							c = p = f = 0;
						}
						this.trigger();
					}

				} else if (SystemMonitor.active) {
					SystemMonitor.stop();
				}
			});
		};
	}),

	/**
	* @private
	*/
	trigger: function() {
		Loop.request(this.cb);
	},

	/**
	* Add a customer to the queue.
	*
	* @param {Object} customer - The item (customer) to add to the queue.
	* @param {String} nom - The name of the customer for later reference.
	* @param {Boolean} [defer] - If `true`, will only create a reference to this customer by name,
	*	and will not add the customer to the queue of customers which have tasks to execute. To add
	*	the customer to the queue later, {@link enyo.BackgroundTaskManager#activate} should be
	*	called.
	* @public
	*/
	add: function (customer, nom, defer) {
		this.namedCustomers[nom] = customer;

		if (!defer) {
			this.activate(customer, nom);
		}
	},

	/**
	* Activates a customer by adding it to the queue. This is normally called when the customer has
	* already been added via {@link enyo.BackgroundTaskManager#add}.
	*
	* @param {Object} customer - The item (customer) to add to the queue.
	* @public
	*/
	activate: function (customer, nom) {
		this.customers.push(customer);
		customer.managed = true;
		customer.on('priorityChanged', this.notifyPriority, this);

		this.trigger();
	},

	/**
	* Remove a specific customer.
	*
	* @param {String} nom - The name of the customer to remove from the queue.
	* @param {Boolean} [preserve] - If `true`, preserves the reference to the manager for future
	*	usage, while removing the manager from the active queue for executing tasks.
	* @public
	*/
	remove: function (nom, preserve) {
		var customer = this.namedCustomers[nom],
			idx;

		if (customer) {
			customer.off('priorityChanged', this.notifyPriority, this);
			customer.cancelTask(); // TODO: should this pause the task instead?
			customer.managed = false;

			idx = this.customers.indexOf(customer);
			if (idx > -1) {
				this.customers.splice(idx, 1);
			}

			if (!preserve) {
				delete this.namedCustomers[nom];
			}
		}

		this.trigger();
	},

	/**
	* Clear the queue of customers.
	*
	* @public
	*/
	clear: function () {
		var idx;
		for (idx = 0; idx < this.customers.length; idx++) {
			this.customers[idx].cancelTask(); // TODO: should this pause the task instead?
		}
		this.customers = [];
		this.namedCustomers = {};
	},

	/**
	* Iterate through customer queue and pause each customer.
	*
	* @public
	*/
	pause: function () {
		this.paused = true;
		var idx;
		for (idx = 0; idx < this.customers.length; idx++) {
			this.customers[idx].pauseTask();
		}
	},

	/**
	* Iterate through customer queue and resume each customer.
	*
	* @public
	*/
	resume: function () {
		this.paused = false;
		for (var idx = 0; idx < this.customers.length; idx++) {
			this.customers[idx].resumeTask();
		}
		this.trigger();
	},

	/**
	* Retrieves a customer by name.
	*
	* @param {String} nom - The name of the customer.
	* @returns {Object} The customer that was originally added with the passed-in name.
	* @public
	*/
	getCustomer: function (nom) {
		return this.namedCustomers[nom];
	},

	/**
	* Determines whether the priority of the last task added to a given customer is urgent
	* enough to move the customer to the front of the queue.
	*
	* @param {Object} customer - The customer which has had a change in priority for one of its
	*	tasks.
	* @param {Number} priority - The priority that will be checked for urgency.
	* @private
	*/
	notifyPriority: function (customer, priority) {
		var idx;

		if (priority == Priorities.SOON) {
			idx = this.customers.indexOf(customer);

			if (idx > -1) {
				this.customers.slice(idx, 1);
				this.customers.unshift(customer);
			}
		}
	},

	/**
	* Give the next customer a chance to execute a single task.
	*
	* @private
	*/
	run: function () {
		var item;

		if (this.customers[0] && !this.customers[0].paused) {
			item = this.customers.shift();
			this.customers.push(item); // move item to back of the queue
			item.runTask();
		}

		this.trigger();
	}

});
