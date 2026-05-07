/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const transit_realtime = $root.transit_realtime = (() => {

    /**
     * Namespace transit_realtime.
     * @exports transit_realtime
     * @namespace
     */
    const transit_realtime = {};

    transit_realtime.FeedMessage = (function() {

        /**
         * Properties of a FeedMessage.
         * @memberof transit_realtime
         * @interface IFeedMessage
         * @property {transit_realtime.IFeedHeader} header FeedMessage header
         * @property {Array.<transit_realtime.IFeedEntity>|null} [entity] FeedMessage entity
         */

        /**
         * Constructs a new FeedMessage.
         * @memberof transit_realtime
         * @classdesc Represents a FeedMessage.
         * @implements IFeedMessage
         * @constructor
         * @param {transit_realtime.IFeedMessage=} [properties] Properties to set
         */
        function FeedMessage(properties) {
            this.entity = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FeedMessage header.
         * @member {transit_realtime.IFeedHeader} header
         * @memberof transit_realtime.FeedMessage
         * @instance
         */
        FeedMessage.prototype.header = null;

        /**
         * FeedMessage entity.
         * @member {Array.<transit_realtime.IFeedEntity>} entity
         * @memberof transit_realtime.FeedMessage
         * @instance
         */
        FeedMessage.prototype.entity = $util.emptyArray;

        /**
         * Encodes the specified FeedMessage message. Does not implicitly {@link transit_realtime.FeedMessage.verify|verify} messages.
         * @function encode
         * @memberof transit_realtime.FeedMessage
         * @static
         * @param {transit_realtime.IFeedMessage} message FeedMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FeedMessage.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            $root.transit_realtime.FeedHeader.encode(message.header, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.entity != null && message.entity.length)
                for (let i = 0; i < message.entity.length; ++i)
                    $root.transit_realtime.FeedEntity.encode(message.entity[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a FeedMessage message from the specified reader or buffer.
         * @function decode
         * @memberof transit_realtime.FeedMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {transit_realtime.FeedMessage} FeedMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FeedMessage.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.FeedMessage();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.header = $root.transit_realtime.FeedHeader.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        if (!(message.entity && message.entity.length))
                            message.entity = [];
                        message.entity.push($root.transit_realtime.FeedEntity.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            if (!message.hasOwnProperty("header"))
                throw $util.ProtocolError("missing required 'header'", { instance: message });
            return message;
        };

        /**
         * Gets the default type url for FeedMessage
         * @function getTypeUrl
         * @memberof transit_realtime.FeedMessage
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FeedMessage.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/transit_realtime.FeedMessage";
        };

        return FeedMessage;
    })();

    transit_realtime.FeedHeader = (function() {

        /**
         * Properties of a FeedHeader.
         * @memberof transit_realtime
         * @interface IFeedHeader
         * @property {string} gtfsRealtimeVersion FeedHeader gtfsRealtimeVersion
         * @property {number|Long|null} [timestamp] FeedHeader timestamp
         */

        /**
         * Constructs a new FeedHeader.
         * @memberof transit_realtime
         * @classdesc Represents a FeedHeader.
         * @implements IFeedHeader
         * @constructor
         * @param {transit_realtime.IFeedHeader=} [properties] Properties to set
         */
        function FeedHeader(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FeedHeader gtfsRealtimeVersion.
         * @member {string} gtfsRealtimeVersion
         * @memberof transit_realtime.FeedHeader
         * @instance
         */
        FeedHeader.prototype.gtfsRealtimeVersion = "";

        /**
         * FeedHeader timestamp.
         * @member {number|Long} timestamp
         * @memberof transit_realtime.FeedHeader
         * @instance
         */
        FeedHeader.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Encodes the specified FeedHeader message. Does not implicitly {@link transit_realtime.FeedHeader.verify|verify} messages.
         * @function encode
         * @memberof transit_realtime.FeedHeader
         * @static
         * @param {transit_realtime.IFeedHeader} message FeedHeader message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FeedHeader.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.gtfsRealtimeVersion);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.timestamp);
            return writer;
        };

        /**
         * Decodes a FeedHeader message from the specified reader or buffer.
         * @function decode
         * @memberof transit_realtime.FeedHeader
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {transit_realtime.FeedHeader} FeedHeader
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FeedHeader.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.FeedHeader();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.gtfsRealtimeVersion = reader.string();
                        break;
                    }
                case 2: {
                        message.timestamp = reader.uint64();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            if (!message.hasOwnProperty("gtfsRealtimeVersion"))
                throw $util.ProtocolError("missing required 'gtfsRealtimeVersion'", { instance: message });
            return message;
        };

        /**
         * Gets the default type url for FeedHeader
         * @function getTypeUrl
         * @memberof transit_realtime.FeedHeader
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FeedHeader.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/transit_realtime.FeedHeader";
        };

        return FeedHeader;
    })();

    transit_realtime.FeedEntity = (function() {

        /**
         * Properties of a FeedEntity.
         * @memberof transit_realtime
         * @interface IFeedEntity
         * @property {string} id FeedEntity id
         * @property {transit_realtime.ITripUpdate|null} [tripUpdate] FeedEntity tripUpdate
         */

        /**
         * Constructs a new FeedEntity.
         * @memberof transit_realtime
         * @classdesc Represents a FeedEntity.
         * @implements IFeedEntity
         * @constructor
         * @param {transit_realtime.IFeedEntity=} [properties] Properties to set
         */
        function FeedEntity(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FeedEntity id.
         * @member {string} id
         * @memberof transit_realtime.FeedEntity
         * @instance
         */
        FeedEntity.prototype.id = "";

        /**
         * FeedEntity tripUpdate.
         * @member {transit_realtime.ITripUpdate|null|undefined} tripUpdate
         * @memberof transit_realtime.FeedEntity
         * @instance
         */
        FeedEntity.prototype.tripUpdate = null;

        /**
         * Encodes the specified FeedEntity message. Does not implicitly {@link transit_realtime.FeedEntity.verify|verify} messages.
         * @function encode
         * @memberof transit_realtime.FeedEntity
         * @static
         * @param {transit_realtime.IFeedEntity} message FeedEntity message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FeedEntity.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
            if (message.tripUpdate != null && Object.hasOwnProperty.call(message, "tripUpdate"))
                $root.transit_realtime.TripUpdate.encode(message.tripUpdate, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a FeedEntity message from the specified reader or buffer.
         * @function decode
         * @memberof transit_realtime.FeedEntity
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {transit_realtime.FeedEntity} FeedEntity
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FeedEntity.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.FeedEntity();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.string();
                        break;
                    }
                case 3: {
                        message.tripUpdate = $root.transit_realtime.TripUpdate.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            if (!message.hasOwnProperty("id"))
                throw $util.ProtocolError("missing required 'id'", { instance: message });
            return message;
        };

        /**
         * Gets the default type url for FeedEntity
         * @function getTypeUrl
         * @memberof transit_realtime.FeedEntity
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FeedEntity.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/transit_realtime.FeedEntity";
        };

        return FeedEntity;
    })();

    transit_realtime.TripUpdate = (function() {

        /**
         * Properties of a TripUpdate.
         * @memberof transit_realtime
         * @interface ITripUpdate
         * @property {transit_realtime.ITripDescriptor|null} [trip] TripUpdate trip
         * @property {Array.<transit_realtime.TripUpdate.IStopTimeUpdate>|null} [stopTimeUpdate] TripUpdate stopTimeUpdate
         */

        /**
         * Constructs a new TripUpdate.
         * @memberof transit_realtime
         * @classdesc Represents a TripUpdate.
         * @implements ITripUpdate
         * @constructor
         * @param {transit_realtime.ITripUpdate=} [properties] Properties to set
         */
        function TripUpdate(properties) {
            this.stopTimeUpdate = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TripUpdate trip.
         * @member {transit_realtime.ITripDescriptor|null|undefined} trip
         * @memberof transit_realtime.TripUpdate
         * @instance
         */
        TripUpdate.prototype.trip = null;

        /**
         * TripUpdate stopTimeUpdate.
         * @member {Array.<transit_realtime.TripUpdate.IStopTimeUpdate>} stopTimeUpdate
         * @memberof transit_realtime.TripUpdate
         * @instance
         */
        TripUpdate.prototype.stopTimeUpdate = $util.emptyArray;

        /**
         * Encodes the specified TripUpdate message. Does not implicitly {@link transit_realtime.TripUpdate.verify|verify} messages.
         * @function encode
         * @memberof transit_realtime.TripUpdate
         * @static
         * @param {transit_realtime.ITripUpdate} message TripUpdate message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TripUpdate.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.trip != null && Object.hasOwnProperty.call(message, "trip"))
                $root.transit_realtime.TripDescriptor.encode(message.trip, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.stopTimeUpdate != null && message.stopTimeUpdate.length)
                for (let i = 0; i < message.stopTimeUpdate.length; ++i)
                    $root.transit_realtime.TripUpdate.StopTimeUpdate.encode(message.stopTimeUpdate[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a TripUpdate message from the specified reader or buffer.
         * @function decode
         * @memberof transit_realtime.TripUpdate
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {transit_realtime.TripUpdate} TripUpdate
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TripUpdate.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.TripUpdate();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.trip = $root.transit_realtime.TripDescriptor.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        if (!(message.stopTimeUpdate && message.stopTimeUpdate.length))
                            message.stopTimeUpdate = [];
                        message.stopTimeUpdate.push($root.transit_realtime.TripUpdate.StopTimeUpdate.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for TripUpdate
         * @function getTypeUrl
         * @memberof transit_realtime.TripUpdate
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TripUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/transit_realtime.TripUpdate";
        };

        TripUpdate.StopTimeUpdate = (function() {

            /**
             * Properties of a StopTimeUpdate.
             * @memberof transit_realtime.TripUpdate
             * @interface IStopTimeUpdate
             * @property {transit_realtime.TripUpdate.IStopTimeEvent|null} [arrival] StopTimeUpdate arrival
             * @property {transit_realtime.TripUpdate.IStopTimeEvent|null} [departure] StopTimeUpdate departure
             * @property {string|null} [stopId] StopTimeUpdate stopId
             * @property {number|null} [scheduleRelationship] StopTimeUpdate scheduleRelationship
             */

            /**
             * Constructs a new StopTimeUpdate.
             * @memberof transit_realtime.TripUpdate
             * @classdesc Represents a StopTimeUpdate.
             * @implements IStopTimeUpdate
             * @constructor
             * @param {transit_realtime.TripUpdate.IStopTimeUpdate=} [properties] Properties to set
             */
            function StopTimeUpdate(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * StopTimeUpdate arrival.
             * @member {transit_realtime.TripUpdate.IStopTimeEvent|null|undefined} arrival
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @instance
             */
            StopTimeUpdate.prototype.arrival = null;

            /**
             * StopTimeUpdate departure.
             * @member {transit_realtime.TripUpdate.IStopTimeEvent|null|undefined} departure
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @instance
             */
            StopTimeUpdate.prototype.departure = null;

            /**
             * StopTimeUpdate stopId.
             * @member {string} stopId
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @instance
             */
            StopTimeUpdate.prototype.stopId = "";

            /**
             * StopTimeUpdate scheduleRelationship.
             * @member {number} scheduleRelationship
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @instance
             */
            StopTimeUpdate.prototype.scheduleRelationship = 0;

            /**
             * Encodes the specified StopTimeUpdate message. Does not implicitly {@link transit_realtime.TripUpdate.StopTimeUpdate.verify|verify} messages.
             * @function encode
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @static
             * @param {transit_realtime.TripUpdate.IStopTimeUpdate} message StopTimeUpdate message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            StopTimeUpdate.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.arrival != null && Object.hasOwnProperty.call(message, "arrival"))
                    $root.transit_realtime.TripUpdate.StopTimeEvent.encode(message.arrival, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.departure != null && Object.hasOwnProperty.call(message, "departure"))
                    $root.transit_realtime.TripUpdate.StopTimeEvent.encode(message.departure, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.stopId != null && Object.hasOwnProperty.call(message, "stopId"))
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.stopId);
                if (message.scheduleRelationship != null && Object.hasOwnProperty.call(message, "scheduleRelationship"))
                    writer.uint32(/* id 5, wireType 0 =*/40).int32(message.scheduleRelationship);
                return writer;
            };

            /**
             * Decodes a StopTimeUpdate message from the specified reader or buffer.
             * @function decode
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {transit_realtime.TripUpdate.StopTimeUpdate} StopTimeUpdate
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            StopTimeUpdate.decode = function decode(reader, length) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.TripUpdate.StopTimeUpdate();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    switch (tag >>> 3) {
                    case 2: {
                            message.arrival = $root.transit_realtime.TripUpdate.StopTimeEvent.decode(reader, reader.uint32());
                            break;
                        }
                    case 3: {
                            message.departure = $root.transit_realtime.TripUpdate.StopTimeEvent.decode(reader, reader.uint32());
                            break;
                        }
                    case 4: {
                            message.stopId = reader.string();
                            break;
                        }
                    case 5: {
                            message.scheduleRelationship = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Gets the default type url for StopTimeUpdate
             * @function getTypeUrl
             * @memberof transit_realtime.TripUpdate.StopTimeUpdate
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            StopTimeUpdate.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/transit_realtime.TripUpdate.StopTimeUpdate";
            };

            return StopTimeUpdate;
        })();

        TripUpdate.StopTimeEvent = (function() {

            /**
             * Properties of a StopTimeEvent.
             * @memberof transit_realtime.TripUpdate
             * @interface IStopTimeEvent
             * @property {number|null} [delay] StopTimeEvent delay
             * @property {number|Long|null} [time] StopTimeEvent time
             */

            /**
             * Constructs a new StopTimeEvent.
             * @memberof transit_realtime.TripUpdate
             * @classdesc Represents a StopTimeEvent.
             * @implements IStopTimeEvent
             * @constructor
             * @param {transit_realtime.TripUpdate.IStopTimeEvent=} [properties] Properties to set
             */
            function StopTimeEvent(properties) {
                if (properties)
                    for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * StopTimeEvent delay.
             * @member {number} delay
             * @memberof transit_realtime.TripUpdate.StopTimeEvent
             * @instance
             */
            StopTimeEvent.prototype.delay = 0;

            /**
             * StopTimeEvent time.
             * @member {number|Long} time
             * @memberof transit_realtime.TripUpdate.StopTimeEvent
             * @instance
             */
            StopTimeEvent.prototype.time = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Encodes the specified StopTimeEvent message. Does not implicitly {@link transit_realtime.TripUpdate.StopTimeEvent.verify|verify} messages.
             * @function encode
             * @memberof transit_realtime.TripUpdate.StopTimeEvent
             * @static
             * @param {transit_realtime.TripUpdate.IStopTimeEvent} message StopTimeEvent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            StopTimeEvent.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.delay != null && Object.hasOwnProperty.call(message, "delay"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.delay);
                if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int64(message.time);
                return writer;
            };

            /**
             * Decodes a StopTimeEvent message from the specified reader or buffer.
             * @function decode
             * @memberof transit_realtime.TripUpdate.StopTimeEvent
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {transit_realtime.TripUpdate.StopTimeEvent} StopTimeEvent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            StopTimeEvent.decode = function decode(reader, length) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.TripUpdate.StopTimeEvent();
                while (reader.pos < end) {
                    let tag = reader.uint32();
                    switch (tag >>> 3) {
                    case 1: {
                            message.delay = reader.int32();
                            break;
                        }
                    case 2: {
                            message.time = reader.int64();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Gets the default type url for StopTimeEvent
             * @function getTypeUrl
             * @memberof transit_realtime.TripUpdate.StopTimeEvent
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            StopTimeEvent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/transit_realtime.TripUpdate.StopTimeEvent";
            };

            return StopTimeEvent;
        })();

        return TripUpdate;
    })();

    transit_realtime.TripDescriptor = (function() {

        /**
         * Properties of a TripDescriptor.
         * @memberof transit_realtime
         * @interface ITripDescriptor
         * @property {string|null} [tripId] TripDescriptor tripId
         * @property {string|null} [routeId] TripDescriptor routeId
         * @property {number|null} [directionId] TripDescriptor directionId
         * @property {string|null} [startTime] TripDescriptor startTime
         * @property {string|null} [startDate] TripDescriptor startDate
         * @property {number|null} [scheduleRelationship] TripDescriptor scheduleRelationship
         */

        /**
         * Constructs a new TripDescriptor.
         * @memberof transit_realtime
         * @classdesc Represents a TripDescriptor.
         * @implements ITripDescriptor
         * @constructor
         * @param {transit_realtime.ITripDescriptor=} [properties] Properties to set
         */
        function TripDescriptor(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * TripDescriptor tripId.
         * @member {string} tripId
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.tripId = "";

        /**
         * TripDescriptor routeId.
         * @member {string} routeId
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.routeId = "";

        /**
         * TripDescriptor directionId.
         * @member {number} directionId
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.directionId = 0;

        /**
         * TripDescriptor startTime.
         * @member {string} startTime
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.startTime = "";

        /**
         * TripDescriptor startDate.
         * @member {string} startDate
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.startDate = "";

        /**
         * TripDescriptor scheduleRelationship.
         * @member {number} scheduleRelationship
         * @memberof transit_realtime.TripDescriptor
         * @instance
         */
        TripDescriptor.prototype.scheduleRelationship = 0;

        /**
         * Encodes the specified TripDescriptor message. Does not implicitly {@link transit_realtime.TripDescriptor.verify|verify} messages.
         * @function encode
         * @memberof transit_realtime.TripDescriptor
         * @static
         * @param {transit_realtime.ITripDescriptor} message TripDescriptor message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        TripDescriptor.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.tripId != null && Object.hasOwnProperty.call(message, "tripId"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.tripId);
            if (message.startTime != null && Object.hasOwnProperty.call(message, "startTime"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.startTime);
            if (message.startDate != null && Object.hasOwnProperty.call(message, "startDate"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.startDate);
            if (message.scheduleRelationship != null && Object.hasOwnProperty.call(message, "scheduleRelationship"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.scheduleRelationship);
            if (message.routeId != null && Object.hasOwnProperty.call(message, "routeId"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.routeId);
            if (message.directionId != null && Object.hasOwnProperty.call(message, "directionId"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.directionId);
            return writer;
        };

        /**
         * Decodes a TripDescriptor message from the specified reader or buffer.
         * @function decode
         * @memberof transit_realtime.TripDescriptor
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {transit_realtime.TripDescriptor} TripDescriptor
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        TripDescriptor.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.transit_realtime.TripDescriptor();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.tripId = reader.string();
                        break;
                    }
                case 5: {
                        message.routeId = reader.string();
                        break;
                    }
                case 6: {
                        message.directionId = reader.uint32();
                        break;
                    }
                case 2: {
                        message.startTime = reader.string();
                        break;
                    }
                case 3: {
                        message.startDate = reader.string();
                        break;
                    }
                case 4: {
                        message.scheduleRelationship = reader.int32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for TripDescriptor
         * @function getTypeUrl
         * @memberof transit_realtime.TripDescriptor
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        TripDescriptor.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/transit_realtime.TripDescriptor";
        };

        return TripDescriptor;
    })();

    return transit_realtime;
})();

export { $root as default };
