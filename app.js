import "dotenv/config"
import express from "express"
import ejs, { name } from "ejs"
import bodyParser from "body-parser"
import session from "express-session"
import mongoose, { model } from "mongoose"
import passport from "passport"
import passportLocalMongoose from "passport-local-mongoose"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import findOrCreate from "mongoose-findorcreate"

const app = express()
const port = process.env.PORT || 3000

app.set("view engine", "ejs")
app.use(express.static("public"))
app.use(bodyParser.urlencoded({
    extended: true
}))
app.use(session({
    secret: "hello",
    saveUninitialized: false,
    resave: false
}))

app.use(passport.initialize())
app.use(passport.session())

mongoose.connect(process.env.MONGO_URI)
    .then(()=>{
    console.log("Atlas Connected Successfully");
    app.listen(port, () => {
        console.log("App running on port", port)
    })
}).catch((err)=>{
    console.error("Mongo Connection Error",err);
})

const clientSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    //password khud handle krta hai
    name: { type: String, required: true },
    googleId: { type: String }
    // ,dob: { type: Date }
})
const lawyerSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    //password khud handle krta hai
    name: { type: String, required: true },
    googleId: { type: String },
    dob: { type: Date },
    city: { type: String },
    registration_id: { type: String },
    experience: { type: Number }
})
const questionSchema = new mongoose.Schema({
    question_text: { type: String, required: true },
    category: { type: String, required: true },
    city: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    asked_by: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    advice: { type: mongoose.Schema.Types.ObjectId, ref: "Advice" }
})
const adviceSchema = new mongoose.Schema({
    advice_text: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    answered_by: { type: mongoose.Schema.Types.ObjectId, ref: "Lawyer" },
    question_id: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
})

clientSchema.plugin(passportLocalMongoose)
clientSchema.plugin(findOrCreate)
lawyerSchema.plugin(passportLocalMongoose)
lawyerSchema.plugin(findOrCreate)

const Client = mongoose.model("Client", clientSchema)
const Lawyer = mongoose.model("Lawyer", lawyerSchema)
const Question = mongoose.model("Question", questionSchema)
const Advice = mongoose.model("Advice", adviceSchema)

passport.use("client-local", Client.createStrategy())
passport.use("lawyer-local", Lawyer.createStrategy())

passport.serializeUser(function (user, cb) {
    process.nextTick(function () {
        let user_type=" ";
        if(user instanceof Client){
            user_type="client"
        }else if(user instanceof Lawyer){
            user_type="lawyer"
        }
        console.log(user_type)
        cb(null, {
            id: user.id,
            username: user.username,
            name: user.name,
            photo: user.photo,
            user_type : user_type
        });
    });
});

passport.deserializeUser(function (user, cb) {
    process.nextTick(function () {
        return cb(null, user);
    });
});

//If I explain authentication, specifically how a serializeUser() works and how data is actually saved – meaning how data comes from
//  and goes into the database – our findOrCreate method checks if the data already exists in the database. If the data 
// exists, great. If not, it saves the data. Then, the current state or current data is returned in a variable
// , let's say named user (or whatever name we give it).
//  The "user" that was returned is a JavaScript object. I can add any field to it, and it's not necessary for that field
//  to exist in the database schema. For instance, even though a photo field didn't exist in the database, we still added 
// it to the user object.

//After this, we call a callback function, which is serializeUser. What serializeUser does is decide which data we want to store
//  in the session. In this case, we saved the photo in the session within serializeUser.

//Now, the key point is that before the callback of findOrCreate, we didn't actually save the photo data to the database.
//  Therefore, the photo data will not be saved in the database; it will only exist within the session
passport.use("google-client", new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://lexify-scfw.onrender.com/auth/google/client/lex",
    scope: ["profile", "email"]
},
    (accessToken, refreshToken, profile, cb) => {
        Client.findOrCreate({
            name: profile.displayName,
            username: profile.emails[0].value,
            googleId: profile.id
        },
            (err, user) => {
                if (err) {
                    return cb(err)
                }
                user.photo = profile.photos[0].value
                return cb(err, user)
            })
    }
))
passport.use("google-lawyer", new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://lexify-scfw.onrender.com/auth/google/lawyer/lex",
    scope: ["profile", "email"]
},
    async (accessToken, refreshToken, profile, cb) => {
        // console.log(profile)
        await Lawyer.findOrCreate({
            name: profile.displayName,
            username: profile.emails[0].value,
            googleId: profile.id
        },
            (err, user) => {
                if (err) {
                    return cb(err)
                }
                user.photo = profile.photos[0].value
                return cb(err, user)
            })
    }
))

app.get("/",async (req, res) => {
    console.log(req.user)
    const response = await Question.find({advice:{$exists : true}}).populate([{ path: "advice" , populate:{path:"answered_by"} }
        ,{ path: "asked_by"}])
    // console.log(JSON.stringify(response,null,2))
    res.render("home.ejs", {
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
        questions:response
    })
})
app.get("/login/client", (req, res) => {
    res.render("client_login.ejs")
})

app.get("/signup/client", (req, res) => {
    res.render("client_signup.ejs")
})
app.get("/login/lawyer", (req, res) => {
    res.render("lawyer_login.ejs")
})

app.get("/signup/lawyer", (req, res) => {
    res.render("lawyer_signup.ejs")
})

app.get("/auth/google/client",
    passport.authenticate("google-client", { scope: ["profile", "email"] })
)
app.get("/auth/google/client/lex",
    passport.authenticate("google-client", { failureRedirect: "/signup/client" }),
    function (req, res) {
        res.redirect("/")
    }
)
app.get("/auth/google/lawyer",
    passport.authenticate("google-lawyer", { scope: ["profile", "email"] })
)
app.get("/auth/google/lawyer/lex",
    passport.authenticate("google-lawyer", { failureRedirect: "/signup/lawyer" }),
    async function (req, res) {
        const lawyer_auth_data = await Lawyer.findById(req.user.id)
        console.log(lawyer_auth_data)
        if (lawyer_auth_data.city) {
            res.redirect("/");
        } else {
            res.render("remaining.ejs")
        }
    }
)
app.get("/questions", async (req, res) => {
    const response = await Question.find({ advice: { $exists: false } }).populate("asked_by", "name")
    console.log(response)
    res.render("questions.ejs", { data: response })
})

app.get("/post-advice-page", async (req, res) => {
    const id = req.query.id
    const response = await Question.find({ _id: id }).populate("asked_by", "name")
    res.render("post_advice.ejs", { data: response[0] })
})

app.post("/post-advice", async (req, res) => {
    const p = req.query
    const advice = new Advice({
        advice_text: req.body.advice_text,
        answered_by: req.user.id,
        question_id: req.query.id
    })
    await advice.save()
    await Question.findByIdAndUpdate(req.query.id, { advice: advice._id })
    res.redirect("/")
})

app.post("/remaining/lawyer", async (req, res) => {
    try {
        if (req.isAuthenticated()) {
            await Lawyer.findOneAndUpdate({ username: req.body.username },
                { dob: req.body.dob, city: req.body.city, registration_id: req.body.registration_id, experience: req.body.experience })
            res.redirect("/")
        }
        else {
            res.redirect("/login/lawyer")
        }
    } catch (err) {
        console.log(err)
    }
})

app.post("/signup/client", async (req, res) => {
    Client.register(new Client({
        username: req.body.username,
        name: req.body.name
    }), req.body.password,
        (err, user) => {
            if (err) {
                console.log(err)
                return res.redirect("/signup/client")
            }
            else {
                passport.authenticate("client-local")(req, res, function () {
                    return res.redirect("/")
                })
            }
        })
})
app.post("/login/client", passport.authenticate("client-local", {
    successRedirect: "/",
    failureRedirect: "/login/client"
})
)
app.post("/signup/lawyer", async (req, res) => {
    // console.log(req.body)
    Lawyer.register(new Lawyer({
        username: req.body.username,
        name: req.body.name,
        dob: req.body.dob,
        registration_id: req.body.registration_id,
        city: req.body.city,
        experience: req.body.experience
    }), req.body.password,
        (err, user) => {
            if (err) {
                console.log(err)
                return res.redirect("/signup/lawyer")
            }
            else {
                // console.log("Registered user:", user);
                passport.authenticate("lawyer-local")(req, res, function () {
                    return res.redirect("/")
                })
            }
        })

})
app.post("/login/lawyer", passport.authenticate("lawyer-local", {
    successRedirect: "/",
    failureRedirect: "/login/lawyer"
})
)

app.get("/ask_question", (req, res) => {
    res.render("ask_question.ejs")
})

app.post("/ask", async (req, res) => {
    try {
        console.log(req.user.id)
        const question = new Question({
            question_text: req.body.question_text,
            category: req.body.category,
            city: req.body.city,
            // created_at: {type: Date, default: Date.now },
            asked_by: req.user.id
        })
        await question.save()
        res.redirect("/")
    } catch (err) {
        console.log(err)
        res.redirect("/ask_question")
    }
    // console.log(req.body)
})

app.get("/client-dashboard", async (req, res) => {
    let response = await Question.find({asked_by:req.user.id,advice:{$exists : true}})
    .populate({ path: "advice", populate: { path: "answered_by" } })
    let response_notanswered = await Question.find({asked_by:req.user.id,advice:{$exists : false}})
    console.log(response)
    // console.log(JSON.stringify(response, null, 2));

    res.render("client_dashboard.ejs", {
        user: req.user,
        questions:response,
        not_answered:response_notanswered
    })
})

app.get("/lawyer-dashboard", async (req, res) => {

    const lawyer_data = await Lawyer.findById(req.user.id)
    console.log(lawyer_data)
    const response = await Question.find({advice:{$exists : true}}).populate([{ path: "advice", match:{answered_by: req.user.id} }
        ,{ path: "asked_by"}])
    console.log(response)
    res.render("lawyer_dashboard.ejs", {
        user: req.user,
        questions:response,
        lawyer:lawyer_data
    })
})
app.get("/logout",(req,res)=>{
    req.logout((err)=>{
        if(err){
            console.log(err)
            res.redirect(req.originalUrl)
        }
        res.redirect("/")
    })
})




