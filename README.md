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
3. [Instance Methods](#instance-methods)
    1. [saveData](#savedata)
    2. [takeSnapshot](#takesnapshot)
    3. [loadRevision](#loadrevision)
4. [Static Methods](#static-methods)
    1. [create](#create)
    2. [findById](#findById)
    3. [createOrFind](#createOrFind)
    4. [createOrUpdate](#createOrUpdate)
## Getting Started
make a directory called models, or eventmodels.
```angular2html
const eventstore = require('eventstore');
const {Model} = require('eventstore-objectmapper');

let es = eventstore();

es.init(function(){
    Model.init(es); //injects the eventstore into the object mapper
)
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

## Instance Methods

### saveData
```angular2html
const User = require('./models/user');

let user = await User.findById(1);

await user.saveData({firstName:'John', lastName:'Doe'});
```
### takeSnapshot
```angular2html
await user.takeSnapshot();
```
### loadRevision
```angular2html
await user.loadRevision(2);
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
```angular2html
const User = require('./models/user');

let user = await User.createOrFind({id:1, firstName:'Brian'});
```
### createOrUpdate

```angular2html
const User = require('./models/user');

let user = await User.createOrUpdate({id:1, firstName:'Brian'});
```