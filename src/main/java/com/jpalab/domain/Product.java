package com.jpalab.domain;

import jakarta.persistence.*;

@Entity
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "product_seq")
    @SequenceGenerator(name = "product_seq", sequenceName = "product_seq", allocationSize = 1)
    private Long id;

    private String name;

    private int price;

    private int stockQuantity;

    @Version
    private int version;

    protected Product() {
    }

    public Product(String name, int price, int stockQuantity) {
        this.name = name;
        this.price = price;
        this.stockQuantity = stockQuantity;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public int getPrice() {
        return price;
    }

    public void setPrice(int price) {
        this.price = price;
    }

    public int getStockQuantity() {
        return stockQuantity;
    }

    public void removeStock(int quantity) {
        int rest = this.stockQuantity - quantity;
        if (rest < 0) {
            throw new IllegalStateException("재고가 부족합니다. 현재 재고: " + this.stockQuantity);
        }
        this.stockQuantity = rest;
    }

    public int getVersion() {
        return version;
    }

    @Override
    public String toString() {
        return "Product{id=" + id + ", name='" + name + "', price=" + price
                + ", stock=" + stockQuantity + ", version=" + version + "}";
    }
}
