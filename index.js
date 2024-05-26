const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const port = process.env.PORT || 5000;

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))


const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded;
    next();
  })
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.of0ix0q.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})
async function run() {
  try {

    // database
    const database = client.db("bloodDonationDB");
    // collection
    const usersCollection = database.collection('users');
    const requestsCollection = database.collection('requests');


    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const userEmail = req.user?.email;
      const isExist = await usersCollection.findOne({ email: userEmail });
      if (!isExist || isExist?.role !== 'admin') {
        return res.status(401).send({ message: 'Access denied' })
      }
      else {
        next();
      }
    };

    // verify volunteer
    // verify admin
    const verifyVolunteer = async (req, res, next) => {
      const userEmail = req.user?.email;
      const isExist = await usersCollection.findOne({ email: userEmail });
      if (!isExist || isExist?.role !== 'volunteer') {
        return res.status(401).send({ message: 'Access denied' })
      }
      else {
        next();
      };
    };


    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      console.log('I need a new jwt', user)
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365h',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    });

    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    });

    // Save or modify user email, status in DB
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const isExist = await usersCollection.findOne(query);
      console.log('User found?----->', isExist);
      if (isExist) return res.send(isExist);
      const result = await usersCollection.updateOne(
        query,
        {
          $set: { ...user, timestamp: Date.now() },
        },
        options
      );
      res.send(result);
    });

    // get role of user
    app.get('/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const isExist = await usersCollection.findOne(query);
      if (!isExist) {
        return res.status(401).send({ message: 'unauthorized access' });
      } else {
        return res.send(isExist.role);
      };

    });




    // get pending count
    app.get('/pending-count', async (req, res) => {

      const query = { donation_status: 'pending' };
      const count = await requestsCollection.countDocuments(query);
      res.send({ count });
    })

    // get all request
    app.get('/requests', async (req, res) => {
      const { size, currentPage } = req.query;
      // console.log(typeof (size), typeof (size));
      const sizeInNumber = parseInt(size);
      const currentPageInNumber = parseInt(currentPage);

      const skipSize = (currentPageInNumber - 1) * sizeInNumber;
      const query = { donation_status: 'pending' };
      const result = await requestsCollection.find(query)
        .skip(skipSize)
        .limit(sizeInNumber)
        .toArray();
      res.send(result);
    });

    // getUsers public
    app.get('/three-donor', async (req, res) => {
      const users = await usersCollection.find().sort({ timestamp: -1 }).limit(3).toArray();
      res.send(users)
    })

    // get searh data
    app.get('/search-donors', async (req, res) => {
      const searchData = req.query;
      const query = {
        district: searchData?.district,
        upazila: searchData?.upazila,
        blood_group: searchData?.blood_group,
      };
      // console.log(query);

      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })


    // get recent three requests
    app.get('/recent-requests/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { recipient_email: email };
      console.log(query)
      const result = await requestsCollection.find(query).sort({ post_date: -1 }).limit(3).toArray();
      res.send(result);
    })

    // get single request
    app.get('/request/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await requestsCollection.findOne(query);
      res.send(result);
    });

    // get requests by email
    app.get('/requests/:email', async (req, res) => {
      const email = req.params.email;
      const query = { recipient_email: email };
      const result = await requestsCollection.find(query).toArray();
      res.send(result);
    });

    // post requestcollection
    app.post('/requests', verifyToken, async (req, res) => {
      const requestData = req.body;
      const postData = {
        ...requestData,
        post_date: Date.now(),
      }
      const result = await requestsCollection.insertOne(postData);
      res.send(result);
    })

    // update request status
    app.put('/requests/:id', verifyToken, async (req, res) => {
      const { status } = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };

      const updateDoc = {
        $set: {
          donation_status: status,
        }
      }

      const result = await requestsCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // update request data
    app.put('/request-up/:id', verifyToken, async (req, res) => {
      const updateData = req.body;
      const id = req.params.id;
      // console.log(updateData);
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };

      const updateDoc = {
        $set: { ...updateData }
      }

      const result = await requestsCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });


    // delete request
    app.delete('/requests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await requestsCollection.deleteOne(query);
      res.send(result);
    })



    // admin related api's

    // get user count
    app.get('/user/count', async (req, res) => {
      const count = await usersCollection.countDocuments();
      res.send({ count })
    })

    // getAllUsers
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const { size, currentPage } = req.query;
      // console.log(typeof (size), typeof (size));
      const sizeInNumber = parseInt(size);
      const currentPageInNumber = parseInt(currentPage);
      const skipSize = (currentPageInNumber - 1) * sizeInNumber;
      const result = await usersCollection.find()
        .skip(skipSize)
        .limit(sizeInNumber)
        .toArray();
      res.send(result);
    })

    // update user role and status
    app.put('/user/role/:id', async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const { role } = req.body;
      // console.log("role", role);
      if (!role) {
        return res.send({ message: "no role found" })
      }
      const options = { upsert: true };
      const updateData = {
        $set: {
          role: role,
        }
      };

      const result = await usersCollection.updateOne(query, updateData, options);
      res.send(result);

    })

    // update user status and status
    app.put('/user/status/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params?.id;
      const query = { _id: new ObjectId(id) };
      const { status } = req.body;
      // console.log("status", status);
      if (!status) {
        return res.send({ message: "no status found" })
      }
      const options = { upsert: true };
      const updateData = {
        $set: {
          status: status,
        }
      };

      const result = await usersCollection.updateOne(query, updateData, options);
      res.send(result);

    })

    // get all blood donation requests
    app.get('/all-requests', verifyToken, verifyAdmin, async (req, res) => {
      const result = await requestsCollection.find().toArray();
      res.send(result);
    })




    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello From Blood Donations Server..')
})

app.listen(port, () => {
  console.log(`Blood Donation Server Is Running on Port ${port}`)
})
