const express = require('express'); 
const mysql = require('mysql2');
const multer = require('multer'); 
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images'); // Directory to save uploaded files
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ storage: storage });

// Create MySQL connection 
const connection = mysql.createConnection({ 
  host: 'sql.freedb.tech', 
  user: 'freedb_23024918', 
  password: '#zRU?FNt4fqYGj$', 
  database: 'freedb_airplaneticketapp' 
});
 
connection.connect((err) => { 
  if (err) { 
    console.error('Error connecting to MySQL:', err); 
    return; 
  } 
  console.log('Connected to MySQL database'); 
});
 
// Set up view engine 
app.set('view engine', 'ejs'); 

// enable static files 
app.use(express.static('public'));

// enable form processing
app.use(express.urlencoded({
  extended: false
}));

// enable static files
app.use(express.static('public'));

// Define routes
app.get('/', (req, res) => { 
  connection.query('SELECT * FROM ticket', (error, results) => { 
    if (error) throw error; 
    res.render('index', { ticket: results }); // Render HTML page with data 
  }); 
});

// Search Bar
app.get('/search', (req, res) => {
  const query = req.query.query;
  connection.query('SELECT * FROM ticket WHERE departure_city LIKE ? OR arrival_city LIKE ? OR airline_name LIKE ?', [`%${query}%`, `%${query}%`, `%${query}`], (error, searchResults) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Error searching for tickets');
    }
    res.render('searchResults', { query, results: searchResults });
  });
});

app.get('/ticket/:id', (req, res) => {
  // Extract the ticket ID from the request parameters
  const id = req.params.id;
  const sql = 'SELECT * FROM ticket WHERE id = ?';
  // Fetch data from MySQL based on the ticket ID
  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Error Retrieving airline by ID');
    }
    // Check if any ticket with the given ID was found
    if (results.length > 0) {
      // Render HTML page with the ticket data
      res.render('ticket', { ticket: results[0] });
    } else {
      // If no ticket with the given ID was found, render a 404 page or handle it accordingly
      res.status(404).send('Ticket not found');
    }
  });
});

app.get('/addTicket', (req, res) => {
  res.render('addTicket');
});

app.post('/addTicket', upload.single('airline_logo'), (req, res) => {
  // Extract ticket data from the request body
  let { departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, price, airline_name, referral_url } = req.body;
  let airline_logo = '';
  if (req.file) {
    airline_logo = req.file.filename; // Save only the filename
  } 
  const sql = 'INSERT INTO ticket (departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, price, airline_name, airline_logo, referral_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  connection.query(sql, [departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, price, airline_name, airline_logo, referral_url], (error, results) => {
    if (error) {
      console.error("Error adding ticket:", error);
      res.status(500).send('Error adding ticket');
    } else {
      res.redirect('/');
    }
  });
});

app.get('/editTicket/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM ticket WHERE id = ?';
  // Fetch data from MySQL based on the ticket ID
  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error('Database query error:', error.message);
      return res.status(500).send('Error Retrieving ticket by ID');
    }
    // Check if any product with the given ID was found
    if (results.length > 0) {
      // Render HTML page with the product data
      res.render('editTicket', { ticket: results[0] });
    } else {
      // If no product with the given ID was found, render a 404 page or handle it accordingly
      res.status(404).send('Ticket not found');
    }
  });
});

app.post('/editTicket/:id', upload.single('airline_logo'), (req, res) => {
  const id = req.params.id;
  let { departure_city, arrival_city, departure_date, departure_time, arrival_date, arrival_time, price, airline_name, referral_url } = req.body;
  
  // Start with the existing data
  let updateFields = {
    departure_city, 
    arrival_city, 
    departure_date, 
    departure_time, 
    arrival_date, 
    arrival_time, 
    price, 
    airline_name, 
    referral_url
  };

  // If a new file is uploaded, add it to the updateFields
  if (req.file) {
    updateFields.airline_logo = req.file.filename;
  }

  // Create the SQL query dynamically based on the fields to update
  const fields = Object.keys(updateFields);
  const values = Object.values(updateFields);
  
  const sql = `UPDATE ticket SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE id = ?`;
  // const sql = `UPDATE ticket SET departure_city = ?, arrival_city = ?, departure_date = ?, departure_time = ?, arrival_date = ?, arrival_time = ?, price = ?, airline_name = ?, airline_logo = ?, referral_url = ? WHERE id = ?`;


  // Add the id to the values array
  values.push(id);

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error("Error updating ticket:", error);
      return res.status(500).send('Error updating ticket');
    } else {
      res.redirect('/');
    }
  });
});

app.get('/deleteTicket/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'DELETE FROM ticket WHERE id = ?';
  connection.query(sql, [id], (error, results) => {
    if (error) {
      // Handle any errors that occur during the database operation
      console.error('Database query error:', error.message);
      return res.status(500).send('Error deleting ticket by ID');
    } else {
      // Send a success response
      res.redirect('/');
    }
  });
});

app.get('/contact', (req, res) => {
  res.render('contact');
});

app.post('/submit', (req, res) => {
  // Activity 3: Edit the lines below include the additional form fields sent by the form
  let { name, email, contact_no, comments } = req.body;
  const sql = 'INSERT INTO feedback (name, email, contact_no, comments) VALUES (?, ?, ?, ?)';
  connection.query(sql, [name, email, contact_no, comments], (error, results) => {
    if (error) {
      console.error("Error adding feedback:", error);
      return res.status(500).send('Error adding feedback');
    } else {
      res.render('submit', { name, email, contact_no, comments });
    }
  });
});

app.get('/feedback', (req, res) => { 
  connection.query('SELECT * FROM feedback', (error, results) => { 
    if (error) throw error; 
    res.render('feedback', { feedback: results }); // Render HTML page with data 
  }); 
}); 

const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => console.log(`Server running http://localhost:${PORT}`));

// Tan Ye Kai 23024918