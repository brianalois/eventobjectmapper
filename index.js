const _ = require('lodash');
const {to} = require('await-to-js');
const { diff, addedDiff, deletedDiff, updatedDiff, detailedDiff } = require('deep-object-diff');
const cleanDeep = require('clean-deep');

module.exports.Model = class Model {

    loadGetters(json, latestJson){
        this.dataValues         = cleanDeep(json, {emptyArrays:false, emptyObjects:false, emptyStrings:false});
        this.latestDataValues   = cleanDeep(json, {emptyArrays:false, emptyObjects:false, emptyStrings:false});

        for( let key in this.dataValues){
            Object.defineProperty(this, key, {
                set: function(value){
                    this.dataValues[key] = value;
                },
                get: function(){
                    return this.dataValues[key];
                },
                configurable: true
            });
        }

        Object.defineProperty(this, 'selectedRevision', {
            get: function(){
                return this.selectedStream.lastRevision;
            },
            configurable: true
        });

        Object.defineProperty(this, 'latestRevision', {
            get: function(){
                return this.latestStream.lastRevision;
            },
            configurable: true
        });
    }

    loadUpdatedValues(info){
        this.addSnapshotStream(info);
        let json       = this.latestFromEvents('selected');
        let latestJSON = this.latestFromEvents('latest');

        this.loadGetters(json, latestJSON);

        return this;
    }


    addSnapshotStream(info){
        this.selectedSnapshot = info.selectedSnapshot;
        this.selectedStream   = info.selectedStream;
        this.latestSnapshot   = info.latestSnapshot;
        this.latestStream     = info.latestStream;
    }

    get primaryValue(){
        return this[this.static.primary_key];
    }

    async reload(){
        let [err, {snapshot, stream}] = await to(this.static.getFromSnapshot(this.primaryValue));
        if(err){
            throw err;
        }
        this.snapshot = snapshot;
        this.stream   = stream;
        this.loadGetters();
        return this;
    }

    latestFromEvents(type='selected'){//could be selected or latest
        if(!this[`${type}Stream`])  throw 'Stream not loaded';
        if(!this[`${type}Snapshot`])  throw 'Snapshot not loaded';
        let events = this[`${type}Stream`].events;

        if(events.length<1) return this[`${type}Snapshot`].data;

        let dataStream = events.map(event=>event.payload);

        let final = dataStream.reduce((final, event)=>{
            return _.merge(final, event);
        });

        final =  _.merge({}, this[`${type}Snapshot`].data, final);
        return final;
    }

    goToLatestRevision(){
        let info = {
            selectedStream:     this.latestStream,
            selectedSnapshot:   this.latestSnapshot,
            latestStream:       this.latestStream,
            latestSnapshot:     this.latestSnapshot
        }

        this.loadUpdatedValues(info);
        return this;
    }

    async goToRevision(revision){
        if(revision<0){//this way we get it back in time
            revision = +this.latestRevision+revision;
            if(revision < 0) throw 'there is no revision lower than 0';
        }

        let err, info;

        [err, info] = await to(this.static.getFromSnapshot(this.primaryValue ,revision));
        if(err) throw err;

        this.loadUpdatedValues(info);
        return this;
    }

    async saveCurrentValues(){
        this.saveWhole(this.dataValues);
    }

    async takeSnapshot(){
        let data = cleanDeep(this.latestDataValues, {emptyArrays:false, emptyObjects:false, emptyStrings:false})
        let [err, data] = await to(this.static.TakeSnapshot(this.primaryValue, data, this.latestStream));
        if(err) throw err;

        return data;
    }

    async saveEvent(data){
        if(_.isEmpty(data)) return this;

        let err, stream;
        [err, stream] = await to(this.static.addEvent(this.primaryValue, data));
        if(err) throw err;

        await this.goToRevision(stream.lastRevision);

        if(+this.latestRevision%this.static.snapshotFrequency === 0){
            await this.takeSnapshot();
        }
        return this;
    }

    saveWhole(data){//this one will process updating data that was removed
        let old_data = this.latestDataValues;
        let difference = diff(old_data, data);

        return this.saveEvent(difference);
    }

    saveData(data){
        let old_data = this.latestDataValues;
        let added_data   = addedDiff(old_data, data);
        let updated_data = updatedDiff(old_data, data);

        let changed_data = _.merge({}, added_data, updated_data);

        return this.saveEvent(changed_data);
    }


    get static(){
        return this.constructor;
    }

    //******************
    //***** Static *****
    //******************


    static emit(events, data){
        if(!this._events) this._events = {};

        if(typeof events === 'string'){
            let event_listeners = this._events[events];
            if(event_listeners) event_listeners.forEach((listener) => listener(data));
        }else{
            for ( let i in events){
                let kind = events[i];
                let event_listeners = this._events[kind];
                if(event_listeners) event_listeners.forEach((listener) => listener(data));
            }
        }
    }

    static on(events, listener){
        if(!this._events) this._events = {};

        if(typeof events === 'string'){
            if(!this._events[events]) this._events[events] = [];

            this._events[events].push(listener);

            return ()=>{
                this._events[events] = this._events[events].filter(l => l !== listener)
            }
        }else{
            for (let i in events){
                let event = events[i];
                if(!this._events[event]) this._events[event] = [];

                this._events[event].push(listener);
            }

            return ()=>{
                for(let event of events){
                    this._events[event] = this._events[event].filter(l => l !== listener)
                }
            }
        }
    }


    static get snapshotFrequency(){
        return 25;
    }

    static async init(es){
        if(Model._es) throw 'Already Initialized';

        Model.es = es;
        Model.es.useEventPublisher(function(evt) {
            Model.emit('completedEvent', evt);
        });

        return new Promise(resolve=>{
            Model.es.init(function(){
                resolve();
            });
        });
    }


    static set es(es){
        Model._es = es;
    }

    static get es(){
        if(!Model._es) throw new Error('eventstream module not initialized, include it. e.g. Model.init(es)');
        return Model._es;
    }

    static get ModelName(){
        return this.toString().split ('(' || /s+/)[0].split (' ' || /s+/)[1];
    }


    static addEvent(id, data){//note there is not an obvious way to get when this event is done being saved to db
        if(!id) throw new Error('id is required to add Event');
        return new Promise(resolve=> {
            this.es.getEventStream({aggregateId: id, aggregate: this.ModelName}, function(err, stream){
                if(err) throw new Error(err);
                stream.addEvent(data);
                stream.commit(function(err, other_stream){

                });

                let event = Model.on('completedEvent', (eventData)=>{
                    if(_.isEqual(data, eventData)){
                        event();//unsubscribes from event
                        resolve(stream);
                    }
                });

            })
        });
    }

    static fromSnapshot(query, revision){
        if(typeof revision === 'undefined'){
            return new Promise((resolve, reject)=>{
                this.es.getFromSnapshot(query, function(err, snapshot, stream){
                    if(err) return reject(err);
                    resolve({snapshot, stream})
                })
            })
        }else{
            return new Promise((resolve, reject)=>{
                this.es.getFromSnapshot(query, revision, (err, snapshot, stream)=>{
                    if(err) return reject(err);
                    if(!snapshot) return reject('no snapshot found error');
                    this.es.getEventStream(query, snapshot.revision, +revision+1, function(err, stream) {
                        resolve({snapshot, stream})
                    });
                })
            })
        }
    }

    static async getFromSnapshot(id, revision){
        if(!id) throw new Error('id required');

        let query = {aggregateId: id, aggregate: this.ModelName};

        let err, snapshot, stream;
        if(typeof revision === 'undefined'){
            [err, {snapshot, stream}] = await to(this.fromSnapshot(query));
            if(err) throw err;

            return {
                selectedSnapshot:snapshot,
                selectedStream:stream,
                latestSnapshot:snapshot,
                latestStream:stream
            };
        }else{
            let data;
            [err, data] = await to(Promise.all([this.fromSnapshot(query, revision), this.fromSnapshot(query)]));
            if(err) throw err;

            let selected = data[0];
            let latest   = data[1];

            return {
                selectedSnapshot:selected.snapshot,
                selectedStream:selected.stream,
                latestSnapshot:latest.snapshot,
                latestStream:latest.stream
            };
        }
    }

    static makeInstance(info){
        if(!info.selectedSnapshot) throw new Error('snapshot required');
        if(!info.selectedStream)   throw new Error('stream required');

        if(!info.latestSnapshot) throw new Error('latest snapshot required');
        if(!info.latestStream)   throw new Error('latest stream required');

        let instance = new this;
        instance.loadUpdatedValues(info);
        return instance;
    }

    static get schema(){
        return {};
    }

    static get primary_key(){
        for(let key in this.schema){
            let value = this.schema[key];
            if(value.primary){
                return key;
            }
        }
        return null;
    }

    static async create(data){
        let id = data[this.primary_key];

        let [err, stream] = await to(this.addEvent(id, data));
        [err, data] = await to(this.TakeSnapshot(id, data, stream));
        if(err) throw err;

        return this.findById(id);
    }

    static async createOrFind(data){
        let id = data[this.primary_key];

        let err, instance
        [err, instance] = await to(this.findById(id));

        if(err) throw err;

        if(instance){
            return instance;
        }else{
            [err, instance] = await to(this.create(data));

            return instance;
        }
    }

    static async findOneAndUpdate(data, options){
        let defaults = {
            upsert:false,
        };

        options = Object.assign(defaults, options);

        let id = data[this.primary_key];

        let err, instance
        [err, instance] = await to(this.findById(id));

        if(err) throw err;

        if(instance){
            return instance.saveData(data);
        }else{
            if(options.upsert){
                [err, instance] = await to(this.create(data));

                if(err) throw err;

                return instance;
            }else{
                return null;
            }
        }
    }

    static async createOrUpdate(data){
        let id = data[this.primary_key];

        let err, instance;
        [err, instance] = await to(this.findById(id));

        if(err) throw err;

        if(instance){
            return instance.saveData(data);
        }else{
            [err, instance] = await to(this.create(data));

            if(err) throw err;

            return instance;
        }
    }

    static async findById(id, options){
        let defaults = {
            revision: null,
        };

        options = Object.assign(defaults, options);

        let err, info;

        if(options.revision !== null){
            [err, info] = await to(this.getFromSnapshot(id, options.revision));
        }else{
            [err, info] = await to(this.getFromSnapshot(id));
        }


        if(!info.selectedSnapshot) return null;

        let instance = this.makeInstance(info);

        if(options.revision !== null && instance.latestRevision < options.revision){
            throw `There is no revision ${options.revision}. The latest revision is ${instance.latestRevision}.`;
        }

        return instance;
    }

    static TakeSnapshot(id, data, stream){
        if(!id) throw new Error('id required');
        return new Promise((resolve, reject)=>{
            this.es.createSnapshot({
                aggregateId: id,
                aggregate: this.ModelName,
                data: data,
                revision: stream.lastRevision,
                version: 1
            }, function(err) {
                if(err) {
                    reject(err);
                }
                resolve();
            });
        });
    }
};
