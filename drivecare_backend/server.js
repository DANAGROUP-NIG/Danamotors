cors = require('cors');
import express from 'express';


const port = process.env.PORT || 5000;


//initialize express app
const app = express();


// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/users', (req, res) => {
  res.send('Hello, World!');
});


app.use((req, res, next) => {
  res.status(404).send('Route not found');
}); 

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});