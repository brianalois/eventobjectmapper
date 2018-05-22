# Eventstore Object Mapper

This maps events to specific objects in an orm like fashon
```angular2html
npm i eventstore-objectmapper
```
### Required Dependencies

Need Node 8 for async await syntax

Also, uses the eventstore module. One must know how to set this up to use this module.
https://www.npmjs.com/package/eventstore
```angular2html
npm i eventstore
```
## Doc Menu
1. [Getting Started](#getting-started)
2. [Example Model](#example-model)
3. [Instance Properties](#instance-properties)
    1. [dataValues](#dataValues)
    2. [latestDataValues](#latestdatavalues)
    3. [selectedRevision](#selectedrevision)
    4. [latestRevision](#latestrevision)
    5. [primaryValue](#primaryvalue)
    6. [getHistory](#gethistory)
3. [Instance Methods](#instance-methods)
    1. [saveData](#savedata)
    2. [saveWhole](#savewhole)
    3. [takeSnapshot](#takesnapshot)
    4. [saveCurrentValues](#savecurrentvalues) 
    5. [goToRevision](#gotorevision)
    6. [goToLatestRevision](#gotolatestrevision)
4. [Static Methods](#static-methods)
    1. [create](#create)
    2. [findById](#findbyid)
    3. [createOrFind](#createorfind)
    4. [createOrUpdate](#createorupdate)
    5. [findOneAndUpdate](#findoneandupdate)
    6. [getHistory](#gethistory)
5. [Static Getters](#static-getters)
    1. [schema](schema)
    2. [snapshotFrequency](snapshotfrequency)
## Getting Started
make a directory called models, or eventmodels.
```angular2html
const eventstore = require('eventstore');
const {Model} = require('eventstore-objectmapper');

let es = eventstore();

Model.init(es).then(()=>{
    //ready to use
}

```

## Example Model
make file called user.js in models directory

```angular2html
const {Model} = require('eventstore-objectmapper');

class User extends Model {
    constructor(id){
        super(id);
    }

    static get schema(){
        return {
            id:{type:"Number", primary:true}
        }
    }
}

module.exports = User;
```

## Instance Properties

### dataValues
```angularjs
let user = await User.create({id:1, first:'Brian', last:'Alois'});

console.log('output:', user.dataValues);

//output: {id:1, first:'Brian', last:'Alois'}

```

### latestDataValues
```angularjs
let user = await User.create({id:1, first:'Brian', last:'Alois'});

await user.saveData({first:'John'});

await user.goToRevision(0);

console.log('selected revision: ', user.dataValues, '\n, latest: ',user.latestDataValues)
//selected revision:  {id:1, first:'Brian', last:'Alois'}, 
//latest: {id:1, first:'John', last:'Alois'}

```

## Instance Methods

### saveData
The saveData method adds and updates data with what is given. 
```angular2html
const User = require('./models/user');

let user = await User.create({id:1, first:'Brian', last:'Alois'});

await user.saveData({info:'software', last:null});

console.log(user.dataValues);
//{id:1, first:'Brian', last:null, info:'software'}
```
### saveWhole
This is a little different from saveData in that the most updated revision becomes entirely the input
```angular2html
const User = require('./models/user');

let user = await User.create({id:1, first:'Brian', last:'Alois'});

await user.saveWhole({id: 1, info:'software'});

console.log(user.dataValues);
//{id: 1, first:null, last: null, info:'software'}
```
### takeSnapshot
takes snapshot of latest values that were saved.
```angular2html
await user.takeSnapshot();
```
### goToRevision
```angular2html
await user = await User.create({id:1, first:'brian', last:'alois'});
console.log(user.selectedRevision, user.first);
//0 brian

await user.saveData({first:'John'});
console.log(user.selectedRevision, user.first);
//1 John

await user.goToRevision(0);
console.log(user.selectedRevision, user.first);
//0 brian
```

### getHistory
returns history of all the events of the instance
```angularjs
let history = await user.getHistory();
```
## Static Methods

### create
```angular2html
const User = require('./models/user');

let user = await User.create({id:1, firstName:'Brian', lastName:' Doe});
```
### findById
```angular2html
const User = require('./models/user');

let user = await User.findById(1);
```
### createOrFind
Method either finds and returns instance or creates it if it doesn't exist
```angular2html
const User = require('./models/user');

let user = await User.createOrFind({id:1, firstName:'Brian'});
```
### createOrUpdate
Method either updates existing instance based on primary key, or if one does not exist
with that primary it creates it
```angular2html
const User = require('./models/user');

let user = await User.createOrUpdate({id:1, firstName:'Brian'});
```

### findOneAndUpdate
finds one based on primary value, in this case is id, and updates it.
```angular2html
let user = await User.findOneAndUpdate({id:1, firstName:'Brian'});
```
if upsert option is set to true it will create it if it is not found

```angularjs
let user = await User.findOneAndUpdate({id:1, firstName:'Brian'}, {upsert:true});
```

the defualt update is a saveData. If you want to do a saveWhole pass in the option whole=true
```angularjs
let user = await User.findOneAndUpdate({id:1, firstName:'Brian'}, {upsert:true, whole:true});

```

### getHistory
get all the events and dates that events were added
```
let user_id = 2
let history = await User.getHisory(user_id);
```
## Static Getters
### schema
This is necessary, particularly the part where there is a key that is primary;
```angularjs
class User extends Model {
    constructor(id){
        super(id);
    }

    static get schema(){
        return {
            id:{type:"Number", primary:true},
            name:{type:"String"}
        }
    }
}
```

### snapshotFrequency
by defualt it is set to take a snapshot at every 25 events, or saves/changes to the data. However, this can be changed.
```angularjs
class User extends Model {
    constructor(id){
        super(id);
    }

    static get schema(){
        return {
            id:{type:"Number", primary:true},
            name:{type:"String"}
        }
    }
    
    static get snapshotFrequency(){
        return 10;
    }
}
```