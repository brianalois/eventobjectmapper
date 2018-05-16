const _ = require('lodash');
const {to} = require('await-to-js');

function difference(object, base) {//gets deep difference between 2 objects
    function changes(object, base) {
        return _.transform(object, function(result, value, key) {
            if (!_.isEqual(value, base[key])) {
                result[key] = (_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value;
            }
        });
    }
    return changes(object, base);
}

module.exports.Model = class Model {

    loadGetters(){
        for( let key in this.dataValues){
            Object.defineProperty(this, key, {
                set: function(value){
                    this.dataValues[key] = value;
                },
                get: function(){
                    return this.dataValues[key];
                }
            });
        }

        Object.defineProperty(this, 'revision', {
            get: function(){
                return this.stream.lastRevision;
            }
        });
    }

    loadUpdatedValues(){
        let json = this.latestFromEvents();
        this.dataValues = json;
        this.loadGetters();
    }


    get primary_value(){
        return this[this.static.primary_key];
    }

    async reload(){
        let [err, {snapshot, stream}] = await to(this.static.getFromSnapshot(this.primary_value));
        if(err){
            throw err;
        }
        this.snapshot = snapshot;
        this.stream   = stream;
        this.loadGetters();
    }

    latestFromEvents(){
        if(!this.stream)  throw 'Stream not loaded';
        if(!this.snapshot)throw 'Snapshot not loaded';
        let events = this.stream.events;

        if(events.length<1) return this.snapshot.data;

        let dataStream = events.map(event=>event.payload);

        let final = dataStream.reduce((final, event)=>{
            return _.merge(final, event);
        });

        final =  _.merge({}, this.snapshot.data, final);
        return final;
    }

    async takeSnapshot(){
        let json = this.latestFromEvents();

        let [err, data] = await to(this.static.TakeSnapshot(this.primary_value, json, this.stream));

        if(err) throw err;

        return data;
    }

    async saveData(data){
        let old_data = this.dataValues;
        let changed_data = difference(data, old_data);
        _.merge(this.dataValues, changed_data);//syncs local data with changed data
        this.static.addEvent(this.primary_value, changed_data);
    }

    get static(){
        return this.constructor;
    }

    //******************
    //***** Static *****
    //******************
    static init(es){
        Model.es = es;
    }

    static set es(es){
        Model._es = es;
        es.useEventPublisher(function(evt) {
            console.log('evt', evt)
        });
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
                    resolve(stream);
                });
            })
        });
    }

    static getFromSnapshot(id, revMax){
        if(!id) throw new Error('id required');

        let query = {aggregateId: id, aggregate: this.ModelName};

        if(typeof revMax === 'undefined'){
            return new Promise((resolve, reject)=>{
                this.es.getFromSnapshot(query, function(err, snapshot, stream){
                    if(err) return reject(err);
                    resolve({snapshot, stream})
                })
            })
        }else{
            return new Promise((resolve, reject)=>{
                this.es.getFromSnapshot(query, revMax, (err, snapshot, stream)=>{
                    if(err) return reject(err);
                    this.es.getEventStream(query, snapshot.revision, +revMax+1, function(err, stream) {
                        resolve({snapshot, stream})
                    });
                })
            })
        }
    }

    static makeInstance(snapshot, stream){
        if(!snapshot) throw new Error('snapshot required');
        if(!stream)   throw new Error('stream required');

        let instance = new this;
        instance.snapshot = snapshot;
        instance.stream   = stream;

        instance.loadUpdatedValues();
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

    static async findById(id, options){
        let defaults = {
            latestFromEvents:false,
            revision: null,
        };

        options = Object.assign(defaults, options);

        let err, snapshot, stream;

        if(options.revision !== null){
            [err, {snapshot, stream}] = await to(this.getFromSnapshot(id, options.revision));
        }else{
            [err, {snapshot, stream}] = await to(this.getFromSnapshot(id));
        }

        if(!snapshot) return null;

        let instance = this.makeInstance(snapshot, stream);
        if(options.latestFromEvents) instance.latestFromEvents();
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
                    console.log('err', err)
                    reject(err);
                }
                resolve();
            });
        });
    }
};
