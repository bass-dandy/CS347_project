var http     = require('http'),
    mongoose = require('mongoose'),
    express  = require('express');

var app = express();

mongoose.connect('mongodb://localhost');

/*****************************************************************************/
/* Schemas *******************************************************************/
/*****************************************************************************/

// Schema for posts
var Post = mongoose.model('Post', {
    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date:    { type: Date, default: Date.now },
    likes:   { type: Number, default: 0 },
    
    image: Buffer,
    description: String,
    tags:       [String],
    comments:   [String]
});

// Schema for users
var User = mongoose.model('User', {
    name:     String,
    email:    String,
    password: String,
    facebook: String,
    insta:    String,
    twitter:  String,

//    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    pins:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],

    isStylist: Boolean,

    stylistInfo: {
        phone:    String,
        web:      String,
        price:    { type: Number, min: 0, max: 5 },
        rating:   { type: Number, min: 0, max: 5 },
    
        tags: [String],

        reviews: [{
            rating: { type: Number, min: 0, max: 5 }, 
            review: String
        }],

        location:  {
            state: String,
            city:  String,
            zip:   String
        }
    }
});

/*****************************************************************************/
/* REST routing **************************************************************/
/*****************************************************************************/

// PUT stylist, initial registration
app.put('/:state/:city/:zip/stylists?', function(req, res) {    
    
    User.findOne({ 'email': req.query.email }, function(err, user) {
        if(user) {
            console.log('Aborting stylist add');
            res.end('A user with that email already exists');
        }
        else {
            var newUser = new User({
                name:      req.query.name,
                email:     req.query.email,
                password:  req.query.password,
                isStylist: true,

                stylistInfo: { 
                    location:  {
                        state: req.params.state,
                        city:  req.params.city,
                        zip:   req.params.zip
                    }
                }
            });
            newUser.save(function(err) { 
                if(err) {
                    console.log(err);
                    return next(err);
                }
            });
            console.log('Adding stylist');
        }
    });
    res.end();
});


// PUT enthusiast, initial registration
app.put('/enthusiasts?', function(req, res) {

    User.findOne({ 'email': req.query.email }, function(err, user) {
        if(user) {
            console.log('Aborting enthusiast add');
            res.end('A user with that email already exists');
        }
        else {
            var newUser = new User({
                name:      req.query.name,
                email:     req.query.email,
                password:  req.query.password,
                isStylist: false
            });
            newUser.save(function(err) { 
                if(err) {
                    console.log(err);
                    return next(err);
                }
            });
            console.log('Adding enthusiast %s with email %s', req.query.name, req.query.email);
        }
    });
    res.end();
});


// POST create a new user post
app.post('/users/:id/posts?', function(req, res) {

    // search for a user to associate the post with
    User.findById(
        req.params.id,
        function(err, user) {
            if(err) {
                console.log(err);
                res.end('error');
            }
            // if user is found, create the post
            if(user) {
                var newPost = new Post({
                    creator:     user._id,
                    description: req.query.desc,
                    tags:        req.query.tags.split(' ')
                });
                newPost.save(function(err) {
                    if(err) {
                        console.log(err);
                        res.end('error');
                    }
                });
            }
        }
    );
    res.end();
});


// POST stylist review
// TODO prevent same user from reviewing same stylist multiple times
app.post('/users/:id/review?', function(req, res) {
    var query  = { 
        '_id': req.params.id, 
        'isStylist': true  
    };
    var update = { 
        $push: { 
            'stylistInfo.reviews': { 
                rating: req.query.rating, 
                review: req.query.review  
            } 
        }
    };
    // update stylist being reviewed
    User.update(query, update,
        function(err, user) {
            if(err) {
                console.log(err);
                res.end('error');
            }
        }
    );
    res.end();
});


// POST like a post 
// TODO prevent user from liking same post multiple times
app.post('/users/:uid/likes/:pid', function(req, res) {
    var query = {
        '_id': req.params.uid,
        'likes': { $nin: [req.params.pid] }
    };
    var update = { 
        $addToSet: { 
            'likes': req.params.pid
        }
    };
    // search for a user to like the post
    User.update(query, update, 
        function(err, user) {
            if(err) {
                console.log(err);
                res.end('error');
            }
            else if(user) {
                // Search for post with given id and increment its likes
                Post.findByIdAndUpdate(req.params.pid, { $inc : {'likes': 1 }},
                    function(err, Post) {
                        if(err) {
                            console.log(err);
                            res.end();
                        }
                    }
                );
            }
        }
    );  
    res.end();
});


// POST pin a post
app.post('/users/:uid/pins/:pid', function(req, res) {

    // Search for post with given id
    Post.findById(req.params.pid).lean().exec(
        function(err, post) {
            if(err) {
                console.log(err);
                res.end();
            }
            // search for a user who is pinning the post
            User.update({ '_id': req.params.uid }, { $addToSet: { 'pins': post._id }},
                function(err, user) {
                if(err) {
                    console.log(err);
                    res.end('error');
                }
            });
    });   
    res.end();
});


// GET login, returns _id of user's profile document
app.get('/users?', function(req, res) {
   
    // search for user with given email and password
    User.findOne({
        'email':    req.query.email,
        'password': req.query.password
    }).lean().exec(function(err, user) {
        if(!user)
            return res.end('user not found');
        else
            return res.end(JSON.stringify(user._id).replace(/"/g, ''));
    });
});


// GET posts by tags
app.get('/posts?', function(req, res) {
    var tags = req.query.tags.split(' ');

    Post.find({
        'tags': { $in: tags }
    }).populate('creator').lean().exec(function(err, posts) {
        return res.end(JSON.stringify(posts))
    });
});


// GET posts by email
app.get('/users/:email/posts', function(req, res) {
    
    User.findOne({ 'email': req.params.email }).exec(function(err, user) {
        if(err) {
            console.log(err);
            res.end();
        }
        if(user) {
            Post.find({ 'creator': user._id  }, function(err, posts) {
                if(err) {
                    console.log(err);
                    res.end();
                }
                res.end(JSON.stringify(posts));
            });
        }
    });
});


// GET stylists by state
app.get('/:state/stylists', function(req, res) {
    User.find({
        'isStylist': true,
        'stylistInfo.location.state': req.params.state
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });
});


// GET stylists by state + city
app.get('/:state/:city/stylists', function(req, res) {
    User.find({
        'isStylist': true,
        'stylistInfo.location.state': req.params.state,
        'stylistInfo.location.city':  req.params.city
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });
});


// GET stylist by zip
app.get('/:state/:city/:zip/stylists', function(req, res) {
    User.find({
        'isStylist': true,
        'stylistInfo.location.zip': req.params.zip
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });
});

/*
// GET stylists by price range
app.get('/stylists?', function(req, res) {
    Stylist.find().where("price").gt(req.query.minprice).lt(req.query.maxprice).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });
});
*/

/****************************************************************************/
/* APEX-specific routes, very hacky *****************************************/
/****************************************************************************/

// GET stylist by state
app.get('/:state///stylists', function(req, res) {
     User.find({
        'isStylist': true,
        'stylistInfo.location.state': req.params.state
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });   
});

// GET stylist by state + city
app.get('/:state/:city//stylists', function(req, res) {
     Stylist.find({
        'isStylist': true,
        'stylistInfo.location.state': req.params.state,
        'stylistInfo.location.city':  req.params.city
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    });   
});

// GET stylist by zip
app.get('/:state//:zip/stylists', function(req, res) {
    Stylist.find({
        'isStylist': true,
        'stylistInfo.location.zip': req.params.zip
    }).lean().exec(function(err, stylists) {
        return res.end(JSON.stringify(stylists))
    }); 
});

/*****************************************************************************/
/*****************************************************************************/
/*****************************************************************************/

app.listen(8888);
