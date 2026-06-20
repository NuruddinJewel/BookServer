const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('Fable Server is Running!')
});

async function run() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db(process.env.DB_NAME);
        const ebooksCollection = database.collection("ebooks");
        const purchasesCollection = database.collection("purchases");
        const bookmarksCollection = database.collection("bookmarks");
        app.get('/ebooks', async (req, res) => {
            try {
                const books = await ebooksCollection.find({}).toArray();
                res.status(200).json(books);
            } catch (error) {
                console.error("Error fetching books:", error);
                res.status(500).json({ error: "Failed to fetch books" });
            }
        });

        // Ebooks Details
        app.get('/ebooks/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                const book = await ebooksCollection.findOne({ id: Number(bookId) });

                if (!book) {
                    return res.status(404).json({ error: "Book not found" });
                }
                res.status(200).json(book);
            } catch (error) {
                console.error("Error fetching book detail:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        //Books By Genre
        app.get('/ebooks', async (req, res) => {
            try {
                const { genre } = req.query;
                let query = {};

                if (genre) {
                    // Case-Sensitive Match (Regex)
                    query.category = { $regex: new RegExp(`^${genre}$`, 'i') };
                }

                const books = await ebooksCollection.find(query).toArray();
                res.status(200).json(books);
            } catch (error) {
                console.error("Error fetching books:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        //Error Handling If no book yet purchased
        app.get('/user/purchased', async (req, res) => {
            try {
                // consider req.user.id
                // const userId = req.user?.id;
                const purchases = [];
                // Check user Id list
                // Query Collection(such as: ordersCollection or purchasesCollection)
                // const purchases = await purchasesCollection.find({ userId: userId }).toArray();
                res.status(200).json(purchases);

            } catch (error) {
                console.error("Error fetching purchases:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Purchase History

        app.get('/user/history', async (req, res) => {
            try {

                const dummyHistory = [
                    {
                        _id: "tx_1",
                        transactionId: "ch_3Mv2b1Lkd90xPq",
                        bookTitle: "The Great Gatsby",
                        purchaseDate: "2026-06-15T08:30:00.000Z",
                        amount: 14.99,
                        status: "success"
                    },
                    {
                        _id: "tx_2",
                        transactionId: "ch_4Nn3c2Mkd91yRt",
                        bookTitle: "Atomic Habits",
                        purchaseDate: "2026-06-18T14:45:00.000Z",
                        amount: 9.99,
                        status: "success"
                    }
                ];

                res.status(200).json(dummyHistory);
            } catch (error) {
                console.error("Error fetching history:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //User Bookmark Add or Delete

        //  (GET)
        app.get('/user/bookmarks', async (req, res) => {
            try {

                const dummyBookmarks = [
                    {
                        _id: "b_bookmark_01",
                        userId: "user_123",
                        book: {
                            _id: "64f1a2b3c4d5e6f7a8b9c001", //  MongoDB ObjectId 
                            title: "The Great Gatsby",
                            author: "F. Scott Fitzgerald",
                            coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500"
                        }
                    },
                    {
                        _id: "b_bookmark_02",
                        userId: "user_123",
                        book: {
                            _id: "64f1a2b3c4d5e6f7a8b9c002",
                            title: "Sci-Fi Chronicles",
                            author: "H. G. Wells",
                            coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500"
                        }
                    }
                ];

                // Test dummy bookmarks const dummyBookmarks = [];
                res.status(200).json(dummyBookmarks);

            } catch (error) {
                console.error("Error fetching bookmarks:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //  (DELETE)
        app.delete('/user/bookmarks/:id', async (req, res) => {
            try {
                const bookmarkId = req.params.id;
                console.log(`Request to delete bookmark ID: ${bookmarkId}`);

                /*  MongoDB Connection
                const result = await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
                */

                res.status(200).json({ success: true, message: "Bookmark removed successfully" });

            } catch (error) {
                console.error("Error deleting bookmark:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //User Profile

        //  User Profile Data(GET)
        app.get('/user/profile', async (req, res) => {
            try {
                /* For JWT Authentication Logic:
                const userId = req.user.id;
                const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
                */

                // Dummy Data
                const dummyUser = {
                    _id: "user_123",
                    name: "John Doe",
                    email: "johndoe@example.com",
                    createdAt: "2026-06-20T12:00:00.000Z"
                };

                res.status(200).json(dummyUser);
            } catch (error) {
                console.error("Error fetching profile:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // User Profile Data Update
        app.put('/user/profile', async (req, res) => {
            try {
                const { name } = req.body; // User Name
                console.log(`Updating profile name to: ${name}`);

                /* For Database:
                const userId = req.user.id;
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { name: name } }
                );
                */

                res.status(200).json({ success: true, message: "Profile updated successfully" });
            } catch (error) {
                console.error("Error updating profile:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Writer

        // (GET)
        app.get('/writer/my-books', async (req, res) => {
            try {
                /*  JWT Authentication Logic
                const writerId = req.user.id; // Logged in writer ID
                const myBooks = await ebooksCollection.find({ writerId: writerId }).toArray();
                */

                // DummyBooks
                const dummyWriterBooks = [
                    {
                        _id: "book_writer_01",
                        title: "The Silent Echoes",
                        category: "Mystery",
                        price: 12.50,
                        rating: 4.8,
                        coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500",
                        status: "approved",
                        writerId: "writer_123"
                    },
                    {
                        _id: "book_writer_02",
                        title: "Shadows of Tomorrow",
                        category: "Sci-Fi",
                        price: 8.99,
                        rating: 0.0,
                        coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500",
                        status: "pending",
                        writerId: "writer_123"
                    }
                ];


                res.status(200).json(dummyWriterBooks);

            } catch (error) {
                console.error("Error fetching writer books:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer (DELETE)
        app.delete('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                console.log(`Request to delete book ID by writer: ${bookId}`);

                /*  MongoDB Operation Logic:
                const result = await ebooksCollection.deleteOne({ _id: new ObjectId(bookId) });
                */

                res.status(200).json({ success: true, message: "Ebook deleted successfully" });

            } catch (error) {
                console.error("Error deleting book by writer:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Book Details GET
        app.get('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;

                /* Database Integration:
                const book = await ebooksCollection.findOne({ _id: new ObjectId(bookId) });
                */

                // Dummy Books Details
                const dummyBookDetails = {
                    _id: bookId,
                    title: "The Silent Echoes",
                    category: "Mystery",
                    price: 12.50
                };

                res.status(200).json(dummyBookDetails);
            } catch (error) {
                console.error("Error fetching book details:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer Book Info Update (PUT)
        app.put('/writer/books/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                const { title, category, price } = req.body;

                console.log(`Updating Book ID ${bookId} with data:`, { title, category, price });

                /* Database Logic
                const result = await ebooksCollection.updateOne(
                    { _id: new ObjectId(bookId) },
                    { $set: { title, category, price, status: 'pending' } } 
                    // Status 'pending' (bookEdit)
                );
                */

                res.status(200).json({ success: true, message: "Book updated successfully" });
            } catch (error) {
                console.error("Error updating book details:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Writer POST Books

        // Writer NEW Book Upload (POST)
        app.post('/writer/books', async (req, res) => {
            try {
                const { title, category, price, coverImage } = req.body;

                // Database Object
                const newEbook = {
                    title,
                    category,
                    price: Number(price),
                    coverImage,
                    rating: 0.0,
                    status: "pending",
                    createdAt: new Date(),
                    writerId: "writer_123"
                };

                console.log("Saving new ebook to database:", newEbook);

                /* MONGODB Collection
                const result = await ebooksCollection.insertOne(newEbook);
                */

                //
                res.status(201).json({
                    success: true,
                    message: "Ebook uploaded successfully and is pending for review."
                });

            } catch (error) {
                console.error("Error creating new ebook:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Writer Sales History

        // Writer Sales (GET)
        app.get('/writer/sales-report', async (req, res) => {
            try {
                /*  JWT and MongoDB (Aggregation):
                const writerId = req.user.id;
                
                // purchases Collection (Only Writer Books)
                const history = await purchasesCollection.find({ writerId: writerId }).sort({ purchaseDate: -1 }).toArray();
                
                // Total Revenue এবং Sales Count Logic
                const totalCopiesSold = history.length;
                const totalRevenue = history.reduce((sum, item) => sum + item.amount, 0);
                */

                // Project Test 
                const dummySalesReport = {
                    stats: {
                        totalRevenue: 238.89,
                        totalCopiesSold: 19,
                        thisMonthRevenue: 48.97
                    },
                    history: [
                        {
                            _id: "sale_001",
                            bookTitle: "The Silent Echoes",
                            purchaseDate: "2026-06-19T10:15:30.000Z",
                            buyerId: "user_buyer_999a",
                            amount: 12.50
                        },
                        {
                            _id: "sale_002",
                            bookTitle: "The Silent Echoes",
                            purchaseDate: "2026-06-14T16:45:00.000Z",
                            buyerId: "user_buyer_888b",
                            amount: 12.50
                        },
                        {
                            _id: "sale_003",
                            bookTitle: "Shadows of Tomorrow",
                            purchaseDate: "2026-06-02T05:20:10.000Z",
                            buyerId: "user_buyer_777c",
                            amount: 8.99
                        }
                    ]
                };

                // Dummy Sales Test
                // const dummySalesReport = { stats: { totalRevenue: 0, totalCopiesSold: 0, thisMonthRevenue: 0 }, history: [] };

                res.status(200).json(dummySalesReport);

            } catch (error) {
                console.error("Error generating sales report:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Writer Bookmarks
        // Writer BookMark List (GET)
        app.get('/writer/bookmarks', async (req, res) => {
            try {
                /* Database Integration Logic:
                const writerId = req.user.id;
                const bookmarks = await bookmarksCollection.find({ userId: writerId }).toArray();
                */

                // Dummy Data
                const dummyWriterBookmarks = [
                    {
                        _id: "wb_01",
                        userId: "writer_123",
                        book: {
                            _id: "64f1a2b3c4d5e6f7a8b9c991",
                            title: "The Art of Fiction",
                            author: "John Gardner",
                            coverImage: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500"
                        }
                    },
                    {
                        _id: "wb_02",
                        userId: "writer_123",
                        book: {
                            _id: "64f1a2b3c4d5e6f7a8b9c992",
                            title: "Storytelling Masterclass",
                            author: "Robert McKee",
                            coverImage: "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=500"
                        }
                    }
                ];

                res.status(200).json(dummyWriterBookmarks);
            } catch (error) {
                console.error("Error fetching writer bookmarks:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Writer BookMarks (DELETE)
        app.delete('/writer/bookmarks/:id', async (req, res) => {
            try {
                const bookmarkId = req.params.id;
                console.log(`Deleting writer bookmark ID: ${bookmarkId}`);

                /* Database Code
                const result = await bookmarksCollection.deleteOne({ _id: new ObjectId(bookmarkId) });
                */

                res.status(200).json({ success: true, message: "Bookmark removed successfully" });
            } catch (error) {
                console.error("Error deleting writer bookmark:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ==========================================
        //         ADMIN USER MANAGEMENT ROUTES
        // ==========================================

        // All User List (GET)
        app.get('/admin/users', async (req, res) => {
            try {
                /* Database Code:
                // Only Admin (Admin Verification Middleware)
                const allUsers = await usersCollection.find({}).toArray();
                */

                // Test DummyUsers
                const dummyUsers = [
                    {
                        _id: "user_001",
                        name: "ABC",
                        email: "abc@example.com",
                        role: "user"
                    },
                    {
                        _id: "writer_123",
                        name: "PQR",
                        email: "pqr@example.com",
                        role: "writer"
                    },
                    {
                        _id: "user_003",
                        name: "XYZ",
                        email: "xyz@example.com",
                        role: "admin"
                    }
                ];

                res.status(200).json(dummyUsers);
            } catch (error) {
                console.error("Error fetching users for admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // User Role Change Route (PUT)
        app.put('/admin/users/:id/role', async (req, res) => {
            try {
                const userId = req.params.id;
                const { role } = req.body;

                console.log(`Admin requested to change User ID: ${userId} role to: ${role}`);

                /* MongoDB Operation Logic
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: { role: role } }
                );
                */

                res.status(200).json({ success: true, message: "User role updated successfully" });
            } catch (error) {
                console.error("Error updating user role by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // User Account Delete (DELETE)
        app.delete('/admin/users/:id', async (req, res) => {
            try {
                const userId = req.params.id;
                console.log(`Admin requested to delete User ID: ${userId}`);

                /* MongoDB Operation Logic
                const result = await usersCollection.deleteOne({ _id: new ObjectId(userId) });
                */

                res.status(200).json({ success: true, message: "User account deleted successfully" });
            } catch (error) {
                console.error("Error deleting user by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // ==========================================
        //          ADMIN EBOOK MANAGEMENT ROUTES
        // ==========================================

        // System Book List (GET)
        app.get('/admin/ebooks', async (req, res) => {
            try {
                /* Database Code:
                // Catalog Book (Approved, Pending, Rejected) Search
                const allBooks = await ebooksCollection.find({}).sort({ createdAt: -1 }).toArray();
                */

                // Dummy Catalog
                const dummyCatalog = [
                    {
                        _id: "book_writer_01",
                        title: "The Silent Echoes",
                        category: "Mystery",
                        price: 12.50,
                        coverImage: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500",
                        status: "approved",
                        writerId: "writer_123"
                    },
                    {
                        _id: "book_writer_02",
                        title: "Shadows of Tomorrow",
                        category: "Sci-Fi",
                        price: 8.99,
                        coverImage: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500",
                        status: "pending",
                        writerId: "writer_123"
                    },
                    {
                        _id: "book_writer_03",
                        title: "Unpublished Draft Secrets",
                        category: "History",
                        price: 15.00,
                        coverImage: "",
                        status: "rejected",
                        writerId: "writer_456"
                    }
                ];

                res.status(200).json(dummyCatalog);
            } catch (error) {
                console.error("Error fetching catalog for admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Book Status Change (PUT) -> Approve / Reject
        app.put('/admin/ebooks/:id/status', async (req, res) => {
            try {
                const bookId = req.params.id;
                const { status } = req.body; // 'approved' or 'rejected'

                console.log(`Admin updated Book ID: ${bookId} status to: ${status}`);

                /* MongoDB Operation Logic
                const result = await ebooksCollection.updateOne(
                    { _id: new ObjectId(bookId) },
                    { $set: { status: status } }
                );
                */

                res.status(200).json({ success: true, message: `Book status updated to ${status}` });
            } catch (error) {
                console.error("Error updating book status by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        // Book Delete From System (DELETE)
        app.delete('/admin/ebooks/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                console.log(`Admin requested to permanently delete Book ID: ${bookId}`);

                /* MongoDB Logic
                const result = await ebooksCollection.deleteOne({ _id: new ObjectId(bookId) });
                */

                res.status(200).json({ success: true, message: "Book deleted permanently from system" });
            } catch (error) {
                console.error("Error deleting book by admin:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });







    } catch (error) {
        console.error("Database connection failed:", error);
    }
}
run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Fable Server listening on port ${PORT}`);
});