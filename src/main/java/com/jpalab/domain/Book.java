package com.jpalab.domain;

import jakarta.persistence.DiscriminatorValue;
import jakarta.persistence.Entity;

@Entity
@DiscriminatorValue("BOOK")
public class Book extends Item {

    private String author;

    private String isbn;

    protected Book() {
    }

    public Book(String name, int price, String author, String isbn) {
        super(name, price);
        this.author = author;
        this.isbn = isbn;
    }

    public String getAuthor() {
        return author;
    }

    public String getIsbn() {
        return isbn;
    }

    @Override
    public String toString() {
        return "Book{id=" + getId() + ", name='" + getName() + "', author='" + author + "'}";
    }
}
